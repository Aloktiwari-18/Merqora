import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { getRazorpayClient, getMockAdapterForTesting } from "../lib/razorpay";
import { findExistingPaymentByIdempotencyKey } from "../lib/idempotency";
import { writeAuditLog } from "../lib/audit";
import { logger } from "../lib/logger";

export const paymentRouter = Router();

/** Public config the frontend needs to open Razorpay Checkout. Never includes the secret. */
paymentRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const client = getRazorpayClient();
    res.json({
      keyId: process.env.RAZORPAY_KEY_ID || null,
      mode: client.mode, // "production" (test-mode keys) or "mock"
    });
  })
);

const createPaymentSchema = z.object({ orderId: z.string() });

paymentRouter.post(
  "/create",
  asyncHandler(async (req, res) => {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) throw new AppError(400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required.");

    const existing = await findExistingPaymentByIdempotencyKey(idempotencyKey);
    if (existing) {
      return res.status(200).json({ payment: existing, idempotent: true });
    }

    const { orderId } = createPaymentSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (order.status === "PAID") throw new AppError(409, "ORDER_ALREADY_PAID", "This order has already been paid.");

    const client = getRazorpayClient();
    const razorpayOrder = await client.createOrder({
      amountInPaise: order.totalInPaise,
      currency: order.currency,
      receipt: order.id,
      notes: { merqoraOrderId: order.id },
    });

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayOrderId: razorpayOrder.id,
        amountInPaise: order.totalInPaise,
        currency: order.currency,
        status: "CREATED",
        idempotencyKey,
      },
    });

    await writeAuditLog({
      merchantId: order.merchantId,
      category: "PAYMENT",
      actor: "system",
      action: "PAYMENT_INITIATED",
      summary: `Payment initiated for order ${order.id} — ₹${(order.totalInPaise / 100).toLocaleString("en-IN")} (${client.mode} mode).`,
      metadata: { orderId: order.id, razorpayOrderId: razorpayOrder.id, mode: client.mode },
      status: "SUCCESS",
    });

    res.status(201).json({
      payment,
      razorpayOrderId: razorpayOrder.id,
      amountInPaise: order.totalInPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || null,
      mode: client.mode,
    });
  })
);

/** Test-mode-only helper: lets the frontend "mock checkout" simulate what Razorpay's checkout.js would return. Disabled in production adapter mode. */
paymentRouter.post(
  "/mock-complete",
  asyncHandler(async (req, res) => {
    const client = getRazorpayClient();
    if (client.mode !== "mock") {
      throw new AppError(400, "NOT_IN_MOCK_MODE", "Mock completion is only available when Razorpay credentials are not configured.");
    }
    const { razorpayOrderId, simulateFailure } = z
      .object({ razorpayOrderId: z.string(), simulateFailure: z.boolean().optional() })
      .parse(req.body);

    if (simulateFailure) {
      return res.json({ simulated: true, failed: true });
    }

    const mock = getMockAdapterForTesting();
    const razorpayPaymentId = `pay_mock_${Math.random().toString(36).slice(2, 12)}`;
    const razorpaySignature = mock.generateMockPaymentSignature(razorpayOrderId, razorpayPaymentId);
    res.json({ simulated: true, failed: false, razorpayOrderId, razorpayPaymentId, razorpaySignature });
  })
);

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

paymentRouter.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const input = verifyPaymentSchema.parse(req.body);
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, include: { order: true } });
    if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "No payment found for this Razorpay order id.");

    const client = getRazorpayClient();
    const isValid = client.verifyPaymentSignature(input);

    if (!isValid) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureReason: "Signature verification failed", razorpayPaymentId: input.razorpayPaymentId },
      });
      await writeAuditLog({
        merchantId: payment.order.merchantId,
        category: "PAYMENT",
        actor: "system",
        action: "PAYMENT_VERIFICATION_FAILED",
        summary: `Payment signature verification FAILED for order ${payment.orderId}. Order was NOT marked as paid.`,
        metadata: { paymentId: payment.id },
        status: "FAILED",
      });
      logger.warn("payment_verification_failed", { paymentId: payment.id, orderId: payment.orderId });
      throw new AppError(400, "SIGNATURE_INVALID", "Payment verification failed. Your order has not been charged.");
    }

    // Never trust the frontend's claim of success — this DB write only
    // happens after the HMAC signature above is verified server-side.
    const [updatedPayment] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "CAPTURED", razorpayPaymentId: input.razorpayPaymentId, razorpaySignature: input.razorpaySignature },
      }),
      prisma.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } }),
    ]);

    // Decrement inventory only now that payment is confirmed.
    const orderItems = await prisma.orderItem.findMany({ where: { orderId: payment.orderId } });
    for (const item of orderItems) {
      await prisma.product.update({ where: { id: item.productId }, data: { inventory: { decrement: item.quantity } } });
    }
    if (payment.order.customerId) {
      await prisma.customer.update({
        where: { id: payment.order.customerId },
        data: { totalSpentInPaise: { increment: payment.order.totalInPaise }, ordersCount: { increment: 1 } },
      });
    }

    await writeAuditLog({
      merchantId: payment.order.merchantId,
      category: "PAYMENT",
      actor: "system",
      action: "PAYMENT_VERIFIED",
      summary: `Payment verified and order ${payment.orderId} marked PAID (₹${(payment.amountInPaise / 100).toLocaleString("en-IN")}).`,
      metadata: { paymentId: payment.id },
      status: "SUCCESS",
    });

    res.json({ payment: updatedPayment, orderStatus: "PAID" });
  })
);
