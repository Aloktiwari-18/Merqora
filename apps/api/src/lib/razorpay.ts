/**
 * Razorpay integration layer.
 *
 * `RazorpayClient` is the interface the rest of the app depends on.
 * - `RazorpayProductionAdapter` calls the real Razorpay Test/Live API via
 *   the official `razorpay` npm SDK. This is what runs when
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are present in the environment.
 * - `RazorpayMockAdapter` is a clean local-dev/test substitute used only
 *   when no credentials are configured, so the rest of the product (cart,
 *   checkout, policy engine, approvals, audit trail, idempotency) can be
 *   developed and demoed without a Razorpay account. It never fabricates
 *   a "successful payment" silently — verification still runs the same
 *   signature-check code path, just against a locally generated signature,
 *   and this mode is clearly logged and exposed to the frontend so nobody
 *   mistakes it for a real payment.
 *
 * IMPORTANT: RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must NEVER be
 * sent to the frontend. Only RAZORPAY_KEY_ID (public) is exposed via
 * GET /api/payment/config.
 */

import crypto from "crypto";
import Razorpay from "razorpay";
import { logger } from "./logger";

export interface CreateOrderInput {
  amountInPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface VerifyPaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface RazorpayClient {
  mode: "production" | "mock";
  createOrder(input: CreateOrderInput): Promise<RazorpayOrder>;
  verifyPaymentSignature(input: VerifyPaymentInput): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

class RazorpayProductionAdapter implements RazorpayClient {
  mode: "production" = "production";
  private client: Razorpay;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId: string, keySecret: string, webhookSecret: string) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  async createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
    const order = await this.client.orders.create({
      amount: input.amountInPaise,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    });
    return { id: order.id, amount: Number(order.amount), currency: order.currency, status: order.status };
  }

  verifyPaymentSignature(input: VerifyPaymentInput): boolean {
    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, input.razorpaySignature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, signature);
  }
}

/**
 * Mock adapter — used automatically when RAZORPAY_KEY_ID/SECRET are absent.
 * It generates order ids and signatures with the exact same HMAC scheme
 * Razorpay uses, using a local mock secret, so the *verification* code
 * path is byte-for-byte identical to production. Nothing about payment
 * success is hardcoded — verification will genuinely fail if the
 * signature doesn't match, exactly like the real thing.
 */
class RazorpayMockAdapter implements RazorpayClient {
  mode: "mock" = "mock";
  private mockSecret = "mock_secret_do_not_use_in_production";

  async createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
    const id = `order_mock_${crypto.randomBytes(10).toString("hex")}`;
    logger.info("razorpay_mock_order_created", { orderId: id, amountInPaise: input.amountInPaise });
    return { id, amount: input.amountInPaise, currency: input.currency, status: "created" };
  }

  verifyPaymentSignature(input: VerifyPaymentInput): boolean {
    const expected = crypto
      .createHmac("sha256", this.mockSecret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, input.razorpaySignature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto.createHmac("sha256", this.mockSecret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, signature);
  }

  /** Test-only helper: lets the mock frontend flow generate a *valid* mock signature,
   *  simulating what would normally happen inside Razorpay's own checkout.js. */
  generateMockPaymentSignature(razorpayOrderId: string, razorpayPaymentId: string): string {
    return crypto.createHmac("sha256", this.mockSecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

let cachedClient: RazorpayClient | null = null;

export function getRazorpayClient(): RazorpayClient {
  if (cachedClient) return cachedClient;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (keyId && keySecret && webhookSecret) {
    logger.info("razorpay_adapter_selected", { mode: "production" });
    cachedClient = new RazorpayProductionAdapter(keyId, keySecret, webhookSecret);
  } else {
    logger.warn("razorpay_adapter_selected", {
      mode: "mock",
      reason: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET not fully configured",
    });
    cachedClient = new RazorpayMockAdapter();
  }
  return cachedClient;
}

export function getMockAdapterForTesting(): RazorpayMockAdapter {
  return new RazorpayMockAdapter();
}
