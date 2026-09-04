import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { writeAuditLog } from "../lib/audit";

export const policiesRouter = Router();
policiesRouter.use(requireAuth);

policiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId } });
    if (!policy) throw new AppError(404, "POLICY_NOT_FOUND", "No policy configured for this merchant.");
    res.json({ policy });
  })
);

const updatePolicySchema = z.object({
  maximumDiscountInPaise: z.number().int().min(0).optional(),
  maximumTransactionInPaise: z.number().int().min(0).optional(),
  automaticPayment: z.boolean().optional(),
  automaticRefund: z.boolean().optional(),
  campaignRequiresApproval: z.boolean().optional(),
  upsellAllowed: z.boolean().optional(),
  agentCanCreateOrder: z.boolean().optional(),
});

policiesRouter.put(
  "/",
  requireRole("ADMIN", "MERCHANT"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const input = updatePolicySchema.parse(req.body);
    const policy = await prisma.merchantPolicy.update({ where: { merchantId }, data: input });

    await writeAuditLog({
      merchantId,
      category: "POLICY",
      actor: `user:${req.user!.userId}`,
      action: "POLICY_UPDATED",
      summary: `Merchant policy updated: ${Object.keys(input).join(", ")}.`,
      metadata: input,
      status: "SUCCESS",
    });

    res.json({ policy });
  })
);
