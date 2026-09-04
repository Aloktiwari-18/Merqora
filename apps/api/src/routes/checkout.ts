import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { evaluateTransaction, evaluateAgentOrderCreation, evaluateDiscount } from "../lib/policyEngine";
import { findExistingOrderByIdempotencyKey } from "../lib/idempotency";
import { writeAuditLog } from "../lib/audit";

export const checkoutRouter = Router();

const createCheckoutSchema = z.object({
  cartId: z.string(),
  campaignId: z.string().optional(), // if the customer is redeeming an approved campaign discount
});

checkoutRouter.post(
  "/create",
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) throw new AppError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required for checkout.");

    const existing = await findExistingOrderByIdempotencyKey(idempotencyKey);
    if (existing) {
      return res.status(200).json({ order: existing, idempotent: true });
    }

    const { cartId, campaignId } = createCheckoutSchema.parse(req.body);
    const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: { product: true } } } });
    if (!cart) throw new AppError(404, "CART_NOT_FOUND", "Cart not found.");
    if (cart.items.length === 0) throw new AppError(400, "EMPTY_CART", "Cannot check out an empty cart.");

    const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId: cart.merchantId } });
    if (!policy) throw new AppError(503, "NO_POLICY", "Merchant policy not configured.");

    const agentGate = evaluateAgentOrderCreation(policy);
    if (agentGate.decision === "BLOCKED") {
      await writeAuditLog({
        merchantId: cart.merchantId,
        category: "POLICY",
        actor: "system",
        action: "CHECKOUT_BLOCKED",
        summary: `Checkout blocked: ${agentGate.reason}`,
        status: "BLOCKED",
      });
      throw new AppError(403, "AGENT_ORDER_CREATION_DISABLED", agentGate.reason);
    }

    // Re-validate inventory at checkout time (it may have changed since add-to-cart).
    for (const item of cart.items) {
      const fresh = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!fresh || fresh.inventory < item.quantity) {
        await writeAuditLog({
          merchantId: cart.merchantId,
          category: "FAILURE",
          actor: "system",
          action: "INVENTORY_CHANGED_AT_CHECKOUT",
          summary: `Checkout blocked: "${item.product.name}" inventory changed since it was added to cart.`,
          status: "BLOCKED",
        });
        throw new AppError(409, "INVENTORY_CHANGED", `"${item.product.name}" is no longer available in the requested quantity.`);
      }
    }

    const subtotalInPaise = cart.items.reduce((s, i) => s + i.unitPriceInPaise * i.quantity, 0);
    const shippingInPaise = subtotalInPaise > 100000 ? 0 : 4900; // free shipping over ₹1000, else ₹49

    let discountInPaise = 0;
    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (campaign && campaign.merchantId === cart.merchantId && campaign.status === "APPROVED") {
        const discountEval = evaluateDiscount(policy, { discountInPaise: campaign.discountInPaise, cartValueInPaise: subtotalInPaise });
        if (discountEval.decision === "ALLOWED") {
          discountInPaise = campaign.discountInPaise;
        }
      }
    }

    const totalInPaise = Math.max(0, subtotalInPaise - discountInPaise) + shippingInPaise;

    const transactionEval = evaluateTransaction(policy, { amountInPaise: totalInPaise });
    if (transactionEval.decision === "BLOCKED") {
      await writeAuditLog({
        merchantId: cart.merchantId,
        category: "POLICY",
        actor: "system",
        action: "CHECKOUT_BLOCKED",
        summary: `Checkout blocked: ${transactionEval.reason}`,
        metadata: { totalInPaise },
        status: "BLOCKED",
      });
      throw new AppError(403, "TRANSACTION_LIMIT_EXCEEDED", transactionEval.reason);
    }

    const order = await prisma.order.create({
      data: {
        merchantId: cart.merchantId,
        customerId: cart.customerId,
        cartId: cart.id,
        status: "PENDING",
        subtotalInPaise,
        discountInPaise,
        shippingInPaise,
        totalInPaise,
        idempotencyKey,
        items: {
          create: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPriceInPaise: i.unitPriceInPaise })),
        },
      },
      include: { items: true },
    });

    await prisma.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED" } });

    await writeAuditLog({
      merchantId: cart.merchantId,
      category: "PAYMENT",
      actor: "customer",
      action: "ORDER_CREATED_PENDING",
      summary: `Order created (pending payment) for ₹${(totalInPaise / 100).toLocaleString("en-IN")}.`,
      metadata: { orderId: order.id, subtotalInPaise, discountInPaise, shippingInPaise },
      status: "SUCCESS",
    });

    res.status(201).json({ order, idempotent: false });
  })
);
