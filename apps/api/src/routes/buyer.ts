import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { runAiBuyer } from "../ai/buyerAgent";
import { evaluateUpsell } from "../lib/policyEngine";

export const buyerRouter = Router();

async function resolveMerchantId(bodyMerchantId?: string): Promise<string> {
  if (bodyMerchantId) return bodyMerchantId;
  const envId = process.env.DEMO_MERCHANT_ID;
  if (envId) return envId;
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!merchant) throw new AppError(503, "NO_MERCHANT_SEEDED", "No merchant found. Run the seed script first.");
  return merchant.id;
}

const chatSchema = z.object({ message: z.string().min(1), merchantId: z.string().optional() });

buyerRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const { message, merchantId: bodyMerchantId } = chatSchema.parse(req.body);
    const merchantId = await resolveMerchantId(bodyMerchantId);
    const result = await runAiBuyer(merchantId, message);
    res.json(result);
  })
);

const upsellSchema = z.object({ productId: z.string(), merchantId: z.string().optional() });

/** Flow 5 — Upsell / Cross-sell agent. Recommendations always come from seeded co-purchase data. */
buyerRouter.post(
  "/upsell",
  asyncHandler(async (req, res) => {
    const { productId, merchantId: bodyMerchantId } = upsellSchema.parse(req.body);
    const merchantId = await resolveMerchantId(bodyMerchantId);

    const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId } });
    if (!policy) throw new AppError(503, "NO_POLICY", "Merchant policy not configured.");

    const evaluation = evaluateUpsell(policy);
    if (evaluation.decision === "BLOCKED") {
      return res.json({ allowed: false, reason: evaluation.reason, recommendations: [] });
    }

    const recs = await prisma.recommendation.findMany({
      where: { merchantId, sourceProductId: productId },
      include: { recommendedProduct: true },
      orderBy: { affinityScore: "desc" },
      take: 3,
    });

    res.json({
      allowed: true,
      recommendations: recs.map((r) => ({
        productId: r.recommendedProductId,
        name: r.recommendedProduct.name,
        priceInPaise: r.recommendedProduct.priceInPaise,
        reason: r.reason,
        coPurchaseCount: r.coPurchaseCount,
      })),
    });
  })
);
