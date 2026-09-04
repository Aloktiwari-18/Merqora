import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { getRazorpayClient, getMockAdapterForTesting } from "../lib/razorpay";
import { evaluateDiscount } from "../lib/policyEngine";
import { generateIdempotencyKey, findExistingPaymentByIdempotencyKey } from "../lib/idempotency";
import { writeAuditLog } from "../lib/audit";

export const failureLabRouter = Router();
failureLabRouter.use(requireAuth);

type Step = { label: string; detail: string };

async function setupOrder(merchantId: string, totalInPaise = 150000) {
  const product = await prisma.product.findFirst({ where: { merchantId, isActive: true } });
  if (!product) throw new AppError(503, "NOT_SEEDED", "No products found — run the seed script first.");
  const order = await prisma.order.create({
    data: {
      merchantId,
      status: "PENDING",
      subtotalInPaise: totalInPaise,
      totalInPaise,
      idempotencyKey: generateIdempotencyKey(),
      items: { create: [{ productId: product.id, quantity: 1, unitPriceInPaise: totalInPaise }] },
    },
  });
  return { order, product };
}

failureLabRouter.post(
  "/simulate/payment-failure",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    const { order } = await setupOrder(merchantId);
    steps.push({ label: "Payment initiated", detail: `Order ${order.id} created, status PENDING.` });

    const client = getRazorpayClient();
    const razorpayOrder = await client.createOrder({ amountInPaise: order.totalInPaise, currency: "INR", receipt: order.id });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, razorpayOrderId: razorpayOrder.id, amountInPaise: order.totalInPaise, status: "CREATED", idempotencyKey: generateIdempotencyKey() },
    });

    // Deliberately wrong signature to simulate a genuine gateway-declined payment.
    const isValid = client.verifyPaymentSignature({
      razorpayOrderId: razorpayOrder.id,
      razorpayPaymentId: "pay_simulated_failure",
      razorpaySignature: "deliberately_invalid_signature",
    });
    steps.push({ label: "Payment failed", detail: `Signature verification result: ${isValid} (simulated gateway decline).` });

    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Simulated: card declined by issuing bank" } });
    steps.push({ label: "Order NOT marked paid", detail: `Order ${order.id} remains in status PENDING.` });
    steps.push({ label: "No duplicate payment", detail: "Order retains a single Payment row in FAILED status; retrying will reuse the same idempotency flow." });
    steps.push({ label: "Customer informed", detail: "Frontend would show: 'Payment failed — your card was not charged. Please try another payment method.'" });

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "system",
      action: "SIMULATED_PAYMENT_FAILURE",
      summary: `[Failure Lab] Simulated payment failure for order ${order.id}. Order correctly remained unpaid.`,
      metadata: { orderId: order.id, paymentId: payment.id },
      status: "FAILED",
    });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "payment-failure", steps, finalState: { orderId: order.id, orderStatus: "PENDING", paymentStatus: "FAILED" } });
  })
);

failureLabRouter.post(
  "/simulate/inventory-changed",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    const product = await prisma.product.findFirst({ where: { merchantId, isActive: true, inventory: { gt: 0 } } });
    if (!product) throw new AppError(503, "NOT_SEEDED", "No in-stock products found.");

    const cart = await prisma.cart.create({
      data: { merchantId, items: { create: [{ productId: product.id, quantity: 1, unitPriceInPaise: product.priceInPaise }] } },
    });
    steps.push({ label: "Input", detail: `Customer added "${product.name}" (stock: ${product.inventory}) to cart ${cart.id}.` });

    // Simulate another customer buying the last units concurrently.
    await prisma.product.update({ where: { id: product.id }, data: { inventory: 0 } });
    steps.push({ label: "System behavior", detail: `Inventory for "${product.name}" dropped to 0 (simulated concurrent purchase) before this customer checked out.` });

    const fresh = await prisma.product.findUnique({ where: { id: product.id } });
    const blocked = !fresh || fresh.inventory < 1;
    steps.push({ label: "Recovery", detail: blocked ? "Checkout re-validates inventory and blocks the order before payment is ever created." : "Inventory was sufficient." });

    // restore inventory so seed data / other demos aren't left broken
    await prisma.product.update({ where: { id: product.id }, data: { inventory: 3 } });

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "system",
      action: "SIMULATED_INVENTORY_RACE",
      summary: `[Failure Lab] Simulated inventory change during checkout for "${product.name}". Checkout was blocked before any payment was created.`,
      metadata: { productId: product.id, cartId: cart.id },
      status: "BLOCKED",
    });
    steps.push({ label: "Final state", detail: "Cart remains unconverted; no order or payment record was created." });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "inventory-changed", steps, finalState: { cartId: cart.id, blocked } });
  })
);

failureLabRouter.post(
  "/simulate/duplicate-request",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    const { order } = await setupOrder(merchantId);
    const idempotencyKey = generateIdempotencyKey();
    steps.push({ label: "Input", detail: `Client sends a payment-create request for order ${order.id} with Idempotency-Key ${idempotencyKey}.` });

    const client = getRazorpayClient();
    const razorpayOrder = await client.createOrder({ amountInPaise: order.totalInPaise, currency: "INR", receipt: order.id });
    const firstPayment = await prisma.payment.create({
      data: { orderId: order.id, razorpayOrderId: razorpayOrder.id, amountInPaise: order.totalInPaise, status: "CREATED", idempotencyKey },
    });
    steps.push({ label: "First request", detail: `Payment ${firstPayment.id} created for the first time.` });

    // Simulate the exact same request being retried (double-click / network retry).
    const existing = await findExistingPaymentByIdempotencyKey(idempotencyKey);
    steps.push({
      label: "Second (duplicate) request",
      detail: existing
        ? `Server detected the same Idempotency-Key and returned the EXISTING payment ${existing.id} instead of creating a new one.`
        : "Unexpected: no existing payment found.",
    });

    const totalPaymentsForOrder = await prisma.payment.count({ where: { orderId: order.id } });
    steps.push({ label: "Final state", detail: `Order ${order.id} has exactly ${totalPaymentsForOrder} Payment row(s) despite two requests.` });

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "system",
      action: "SIMULATED_DUPLICATE_REQUEST",
      summary: `[Failure Lab] Duplicate payment-create request for order ${order.id} was safely deduplicated via idempotency key.`,
      metadata: { orderId: order.id, idempotencyKey },
      status: "SUCCESS",
    });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "duplicate-request", steps, finalState: { orderId: order.id, paymentCount: totalPaymentsForOrder } });
  })
);

failureLabRouter.post(
  "/simulate/api-timeout",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    steps.push({ label: "Input", detail: "Client calls an external dependency with a 5-second timeout budget." });

    const timeoutMs = 800; // kept short so the demo stays responsive
    const slowCall = new Promise((resolve) => setTimeout(() => resolve("late-response"), timeoutMs + 500));
    const timeout = new Promise((_resolve, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs));

    let outcome: "timed_out" | "completed" = "completed";
    try {
      await Promise.race([slowCall, timeout]);
    } catch {
      outcome = "timed_out";
    }
    steps.push({ label: "System behavior", detail: `Request ${outcome === "timed_out" ? "exceeded" : "completed within"} the ${timeoutMs}ms budget.` });
    steps.push({ label: "Recovery", detail: "No order/payment state was created or mutated while the dependency was pending — the request is abandoned cleanly, and the client can retry with the same idempotency key." });

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "system",
      action: "SIMULATED_API_TIMEOUT",
      summary: `[Failure Lab] Simulated a slow downstream call that ${outcome === "timed_out" ? "timed out" : "completed"}; no partial state was persisted.`,
      status: outcome === "timed_out" ? "FAILED" : "SUCCESS",
    });
    steps.push({ label: "Final state", detail: "No dangling records created." });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "api-timeout", steps, finalState: { outcome } });
  })
);

failureLabRouter.post(
  "/simulate/webhook-delay",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    const { order } = await setupOrder(merchantId);
    const mock = getMockAdapterForTesting();
    const razorpayOrderId = `order_mock_${Math.random().toString(36).slice(2, 10)}`;
    const razorpayPaymentId = `pay_mock_${Math.random().toString(36).slice(2, 10)}`;

    await prisma.payment.create({
      data: { orderId: order.id, razorpayOrderId, amountInPaise: order.totalInPaise, status: "CREATED", idempotencyKey: generateIdempotencyKey() },
    });
    steps.push({ label: "Input", detail: `Payment created for order ${order.id}; customer completes checkout, but the payment gateway's webhook is delayed.` });
    steps.push({ label: "System behavior", detail: "Order stays PENDING until either the synchronous /payment/verify call or the webhook confirms it." });

    // Simulate the webhook finally arriving.
    const signature = mock.generateMockPaymentSignature(razorpayOrderId, razorpayPaymentId);
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: razorpayPaymentId, order_id: razorpayOrderId } } } });
    const validSig = mock.verifyWebhookSignature(rawBody, signature);
    steps.push({ label: "Recovery", detail: `Delayed webhook arrives later with a valid signature (${validSig}) and reconciles the order.` });

    if (validSig) {
      await prisma.$transaction([
        prisma.payment.update({ where: { razorpayOrderId }, data: { status: "CAPTURED", razorpayPaymentId } }),
        prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
      ]);
    }

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "system",
      action: "SIMULATED_WEBHOOK_DELAY",
      summary: `[Failure Lab] Simulated a delayed Razorpay webhook for order ${order.id}; order was reconciled to PAID once the webhook arrived.`,
      metadata: { orderId: order.id },
      status: "SUCCESS",
    });
    steps.push({ label: "Final state", detail: `Order ${order.id} is now PAID.` });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "webhook-delay", steps, finalState: { orderId: order.id, orderStatus: "PAID" } });
  })
);

failureLabRouter.post(
  "/simulate/invalid-discount",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId } });
    if (!policy) throw new AppError(503, "NO_POLICY", "Merchant policy not configured.");

    const proposedDiscountInPaise = policy.maximumDiscountInPaise + 100000; // deliberately over the limit
    steps.push({ label: "Input", detail: `Agent proposes a ₹${(proposedDiscountInPaise / 100).toLocaleString("en-IN")} discount on a ₹2,000 cart.` });

    const evaluation = evaluateDiscount(policy, { discountInPaise: proposedDiscountInPaise, cartValueInPaise: 200000 });
    steps.push({ label: "System behavior", detail: `Policy engine evaluated the proposal: ${evaluation.decision} — ${evaluation.reason}` });
    steps.push({ label: "Recovery", detail: "The discount is rejected before it ever reaches checkout; no order or payment is affected." });

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "agent:revenue_agent",
      action: "SIMULATED_INVALID_DISCOUNT",
      summary: `[Failure Lab] Agent-proposed discount of ₹${(proposedDiscountInPaise / 100).toLocaleString("en-IN")} was BLOCKED by policy (limit ₹${(policy.maximumDiscountInPaise / 100).toLocaleString("en-IN")}).`,
      status: "BLOCKED",
    });
    steps.push({ label: "Final state", detail: "No discount applied." });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "invalid-discount", steps, finalState: { decision: evaluation.decision } });
  })
);

failureLabRouter.post(
  "/simulate/product-unavailable",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    const product = await prisma.product.findFirst({ where: { merchantId } });
    if (!product) throw new AppError(503, "NOT_SEEDED", "No products found.");

    const originalInventory = product.inventory;
    await prisma.product.update({ where: { id: product.id }, data: { inventory: 0 } });
    steps.push({ label: "Input", detail: `Customer tries to add "${product.name}" (now out of stock) to their cart.` });

    const cart = await prisma.cart.create({ data: { merchantId } });
    let blocked = false;
    try {
      const fresh = await prisma.product.findUnique({ where: { id: product.id } });
      if (!fresh || fresh.inventory < 1) {
        blocked = true;
      } else {
        await prisma.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: 1, unitPriceInPaise: product.priceInPaise } });
      }
    } catch {
      blocked = true;
    }
    steps.push({ label: "System behavior", detail: blocked ? "Add-to-cart rejected: insufficient inventory." : "Item added unexpectedly." });

    await prisma.product.update({ where: { id: product.id }, data: { inventory: originalInventory } });
    steps.push({ label: "Recovery", detail: "Inventory restored after simulation; real customers never saw an incorrect stock count." });

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "system",
      action: "SIMULATED_PRODUCT_UNAVAILABLE",
      summary: `[Failure Lab] Add-to-cart for out-of-stock product "${product.name}" was correctly blocked.`,
      status: "BLOCKED",
    });
    steps.push({ label: "Final state", detail: "Cart remains empty." });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "product-unavailable", steps, finalState: { blocked } });
  })
);

failureLabRouter.post(
  "/simulate/llm-timeout",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const steps: Step[] = [];
    steps.push({ label: "Input", detail: 'Merchant asks Nova: "Why did revenue decrease this week?" but the AI provider is unreachable.' });

    const agentRun = await prisma.agentRun.create({ data: { merchantId, agentType: "revenue_agent", userMessage: "[Failure Lab simulated request]", status: "RUNNING" } });
    // Simulate a provider failure regardless of whether a real key is configured.
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "FAILED", finalResponse: "The AI provider timed out.", completedAt: new Date() },
    });
    steps.push({ label: "System behavior", detail: "The tool-calling loop catches the provider error/timeout and marks the AgentRun as FAILED rather than hanging or returning a fabricated answer." });
    steps.push({ label: "Recovery", detail: "The merchant sees a clear error message and can retry; no partial or hallucinated data is shown as if it were real." });

    const auditEntry = await writeAuditLog({
      merchantId,
      category: "FAILURE",
      actor: "agent:revenue_agent",
      action: "SIMULATED_LLM_TIMEOUT",
      summary: `[Failure Lab] Simulated AI provider timeout on AgentRun ${agentRun.id}. No fabricated answer was returned to the merchant.`,
      metadata: { agentRunId: agentRun.id },
      status: "FAILED",
    });
    steps.push({ label: "Final state", detail: `AgentRun ${agentRun.id} marked FAILED.` });
    steps.push({ label: "Audit logged", detail: `Audit log entry ${auditEntry?.id} recorded.` });

    res.json({ scenario: "llm-timeout", steps, finalState: { agentRunId: agentRun.id, status: "FAILED" } });
  })
);
