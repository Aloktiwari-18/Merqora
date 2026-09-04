import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getRazorpayClient } from "../lib/razorpay";
import { writeAuditLog } from "../lib/audit";
import { logger } from "../lib/logger";

export const webhooksRouter = Router();

/**
 * NOTE: this route is mounted in server.ts with `express.raw()` (not
 * express.json()) so `req.body` here is the exact raw bytes Razorpay signed
 * — verifying against a re-serialized JSON object would silently break
 * signature verification the moment key ordering or whitespace differs.
 */
webhooksRouter.post("/razorpay", async (req, res) => {
  const signature = req.header("x-razorpay-signature");
  const rawBody = (req.body as Buffer).toString("utf8");

  if (!signature) {
    return res.status(400).json({ error: { code: "MISSING_SIGNATURE", message: "x-razorpay-signature header missing." } });
  }

  const client = getRazorpayClient();
  const signatureValid = client.verifyWebhookSignature(rawBody, signature);

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // keep payload as {}
  }

  const event = await prisma.webhookEvent.create({
    data: {
      provider: "razorpay",
      eventType: payload.event || "unknown",
      payload,
      signatureValid,
      processed: false,
    },
  });

  if (!signatureValid) {
    logger.warn("webhook_signature_invalid", { eventId: event.id });
    return res.status(400).json({ error: { code: "INVALID_SIGNATURE", message: "Webhook signature verification failed." } });
  }

  try {
    await handleEvent(payload, event.id);
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processed: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processingError: message } });
    logger.error("webhook_processing_failed", { eventId: event.id, message });
    // Still return 200 so Razorpay doesn't hammer retries for a permanent
    // application-level error; the WebhookEvent row keeps the failure
    // visible in the Audit Log / Failure Lab either way.
  }

  res.status(200).json({ received: true });
});

async function handleEvent(payload: any, webhookEventId: string) {
  const event = payload.event as string | undefined;
  if (!event) return;

  if (event === "payment.captured" || event === "payment.authorized") {
    const paymentEntity = payload.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;
    if (!razorpayOrderId) return;

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId }, include: { order: true } });
    if (!payment) return; // Unknown order — nothing to reconcile.

    // Idempotent: if we already marked this CAPTURED (e.g. via the
    // synchronous /verify call), this webhook simply confirms it again
    // rather than double-processing (no duplicate inventory decrement etc).
    if (payment.status === "CAPTURED") {
      await writeAuditLog({
        merchantId: payment.order.merchantId,
        category: "PAYMENT",
        actor: "system",
        action: "WEBHOOK_CONFIRMED_ALREADY_CAPTURED",
        summary: `Webhook confirmed payment for order ${payment.orderId} (already captured via synchronous verification).`,
        metadata: { webhookEventId },
        status: "SUCCESS",
      });
      return;
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "CAPTURED", razorpayPaymentId: paymentEntity.id },
      }),
      prisma.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } }),
    ]);

    await writeAuditLog({
      merchantId: payment.order.merchantId,
      category: "PAYMENT",
      actor: "system",
      action: "WEBHOOK_PAYMENT_CAPTURED",
      summary: `Webhook confirmed payment capture for order ${payment.orderId} (out-of-band from checkout, e.g. delayed webhook).`,
      metadata: { webhookEventId },
      status: "SUCCESS",
    });
  }

  if (event === "payment.failed") {
    const paymentEntity = payload.payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id;
    if (!razorpayOrderId) return;
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId }, include: { order: true } });
    if (!payment) return;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: paymentEntity.error_description || "Payment failed at gateway" },
    });

    await writeAuditLog({
      merchantId: payment.order.merchantId,
      category: "PAYMENT",
      actor: "system",
      action: "WEBHOOK_PAYMENT_FAILED",
      summary: `Webhook reported payment failure for order ${payment.orderId}. Order remains unpaid; no duplicate payment created.`,
      metadata: { webhookEventId },
      status: "FAILED",
    });
  }
}
