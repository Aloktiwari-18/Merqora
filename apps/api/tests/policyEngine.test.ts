import { describe, it, expect } from "vitest";
import {
  evaluateDiscount,
  evaluateTransaction,
  evaluateAgentOrderCreation,
  evaluateCampaign,
  evaluateUpsell,
} from "../src/lib/policyEngine";

function makePolicy(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "policy_1",
    merchantId: "merchant_1",
    maximumDiscountInPaise: 50000, // ₹500
    maximumTransactionInPaise: 1000000, // ₹10,000
    automaticPayment: false,
    automaticRefund: false,
    campaignRequiresApproval: true,
    upsellAllowed: true,
    agentCanCreateOrder: true,
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

describe("policyEngine.evaluateDiscount", () => {
  it("allows a discount within policy limits", () => {
    const result = evaluateDiscount(makePolicy(), { discountInPaise: 20000, cartValueInPaise: 400000 });
    expect(result.decision).toBe("ALLOWED");
  });

  it("blocks a discount above the merchant's maximum", () => {
    const result = evaluateDiscount(makePolicy(), { discountInPaise: 100000, cartValueInPaise: 400000 });
    expect(result.decision).toBe("BLOCKED");
    expect(result.reason).toMatch(/exceeds merchant policy maximum/i);
  });

  it("blocks a discount larger than the cart value", () => {
    const result = evaluateDiscount(makePolicy(), { discountInPaise: 40000, cartValueInPaise: 20000 });
    expect(result.decision).toBe("BLOCKED");
  });

  it("blocks a zero or negative discount", () => {
    expect(evaluateDiscount(makePolicy(), { discountInPaise: 0, cartValueInPaise: 20000 }).decision).toBe("BLOCKED");
  });
});

describe("policyEngine.evaluateTransaction", () => {
  it("blocks a transaction above the maximum", () => {
    const result = evaluateTransaction(makePolicy(), { amountInPaise: 2000000 });
    expect(result.decision).toBe("BLOCKED");
  });

  it("requires approval when automaticPayment is false", () => {
    const result = evaluateTransaction(makePolicy({ automaticPayment: false }), { amountInPaise: 500000 });
    expect(result.decision).toBe("ALLOWED");
    if (result.decision === "ALLOWED") expect(result.requiresApproval).toBe(true);
  });

  it("does not require approval when automaticPayment is true", () => {
    const result = evaluateTransaction(makePolicy({ automaticPayment: true }), { amountInPaise: 500000 });
    expect(result.decision).toBe("ALLOWED");
    if (result.decision === "ALLOWED") expect(result.requiresApproval).toBe(false);
  });
});

describe("policyEngine.evaluateAgentOrderCreation", () => {
  it("blocks when agentCanCreateOrder is false", () => {
    expect(evaluateAgentOrderCreation(makePolicy({ agentCanCreateOrder: false })).decision).toBe("BLOCKED");
  });
  it("allows when agentCanCreateOrder is true", () => {
    expect(evaluateAgentOrderCreation(makePolicy({ agentCanCreateOrder: true })).decision).toBe("ALLOWED");
  });
});

describe("policyEngine.evaluateCampaign", () => {
  it("blocks a campaign discount above policy maximum", () => {
    const result = evaluateCampaign(makePolicy(), { discountInPaise: 100000, estimatedRecoverableInPaise: 1000000, audienceSize: 100 });
    expect(result.decision).toBe("BLOCKED");
  });

  it("requires approval when campaignRequiresApproval is true", () => {
    const result = evaluateCampaign(makePolicy({ campaignRequiresApproval: true }), {
      discountInPaise: 20000,
      estimatedRecoverableInPaise: 1000000,
      audienceSize: 100,
    });
    expect(result.decision).toBe("ALLOWED");
    if (result.decision === "ALLOWED") expect(result.requiresApproval).toBe(true);
  });
});

describe("policyEngine.evaluateUpsell", () => {
  it("blocks upsell recommendations when disabled", () => {
    expect(evaluateUpsell(makePolicy({ upsellAllowed: false })).decision).toBe("BLOCKED");
  });
});
