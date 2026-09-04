import { describe, it, expect, vi } from "vitest";

// The real @prisma/client package is only generated after `npx prisma generate`
// is run against a reachable database provider — not available in this
// sandbox's restricted network (see docs/architecture.md). We stub it here
// purely so unit tests for non-DB logic (signature verification, idempotency
// key generation) can run without a generated client.
vi.mock("@prisma/client", () => ({ PrismaClient: class {} }));

import { getMockAdapterForTesting } from "../src/lib/razorpay";
import { generateIdempotencyKey } from "../src/lib/idempotency";

describe("RazorpayMockAdapter.verifyPaymentSignature", () => {
  it("accepts a signature generated the same way Razorpay's checkout.js would produce it", () => {
    const mock = getMockAdapterForTesting();
    const razorpayOrderId = "order_test_123";
    const razorpayPaymentId = "pay_test_456";
    const signature = mock.generateMockPaymentSignature(razorpayOrderId, razorpayPaymentId);

    const isValid = mock.verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature: signature });
    expect(isValid).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const mock = getMockAdapterForTesting();
    const isValid = mock.verifyPaymentSignature({
      razorpayOrderId: "order_test_123",
      razorpayPaymentId: "pay_test_456",
      razorpaySignature: "0000000000000000000000000000000000000000000000000000000000000000",
    });
    expect(isValid).toBe(false);
  });

  it("rejects a signature computed for a different order/payment pair", () => {
    const mock = getMockAdapterForTesting();
    const signature = mock.generateMockPaymentSignature("order_A", "pay_A");
    const isValid = mock.verifyPaymentSignature({ razorpayOrderId: "order_B", razorpayPaymentId: "pay_B", razorpaySignature: signature });
    expect(isValid).toBe(false);
  });
});

describe("RazorpayMockAdapter.verifyWebhookSignature", () => {
  it("verifies a webhook body signed with the same HMAC scheme", () => {
    const mock = getMockAdapterForTesting();
    const body = JSON.stringify({ event: "payment.captured" });
    const crypto = require("crypto");
    const signature = crypto.createHmac("sha256", "mock_secret_do_not_use_in_production").update(body).digest("hex");
    expect(mock.verifyWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a webhook body whose signature does not match", () => {
    const mock = getMockAdapterForTesting();
    expect(mock.verifyWebhookSignature(JSON.stringify({ event: "payment.captured" }), "invalid")).toBe(false);
  });
});

describe("idempotency key generation", () => {
  it("generates unique keys with a stable prefix", () => {
    const a = generateIdempotencyKey();
    const b = generateIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a.startsWith("idem_")).toBe(true);
    expect(b.startsWith("idem_")).toBe(true);
  });
});
