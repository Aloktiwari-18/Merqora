/**
 * POLICY ENGINE
 * ------------------------------------------------------------------
 * This module is 100% deterministic, plain TypeScript — NO LLM call
 * happens anywhere inside this file, and it must stay that way.
 *
 * Design principle for the whole product:
 *   AI proposes.  Policy decides.  Humans approve sensitive actions.
 *   Code executes money movement.  Audit records everything.
 *
 * The AI agent may PROPOSE a discount, a campaign, or an order — but
 * every proposal is passed through the functions below before any
 * money-moving action is allowed to execute. The policy engine never
 * receives natural language; it only receives structured numbers.
 */

import type { MerchantPolicy } from "@prisma/client";

export type PolicyResult =
  | { decision: "ALLOWED"; requiresApproval: boolean; reason: string }
  | { decision: "BLOCKED"; requiresApproval: false; reason: string };

export interface DiscountProposal {
  discountInPaise: number;
  cartValueInPaise: number;
}

export interface TransactionProposal {
  amountInPaise: number;
}

export interface CampaignProposal {
  discountInPaise: number;
  estimatedRecoverableInPaise: number;
  audienceSize: number;
}

/** Evaluate whether a proposed discount is allowed under merchant policy. */
export function evaluateDiscount(
  policy: MerchantPolicy,
  proposal: DiscountProposal
): PolicyResult {
  if (proposal.discountInPaise <= 0) {
    return { decision: "BLOCKED", requiresApproval: false, reason: "Discount must be a positive amount." };
  }
  if (proposal.discountInPaise > proposal.cartValueInPaise) {
    return { decision: "BLOCKED", requiresApproval: false, reason: "Discount cannot exceed cart value." };
  }
  if (proposal.discountInPaise > policy.maximumDiscountInPaise) {
    return {
      decision: "BLOCKED",
      requiresApproval: false,
      reason: `Discount ₹${paise(proposal.discountInPaise)} exceeds merchant policy maximum of ₹${paise(
        policy.maximumDiscountInPaise
      )}.`,
    };
  }
  return {
    decision: "ALLOWED",
    requiresApproval: false,
    reason: `Discount within policy limit of ₹${paise(policy.maximumDiscountInPaise)}.`,
  };
}

/** Evaluate whether a transaction (order/payment) amount is allowed. */
export function evaluateTransaction(
  policy: MerchantPolicy,
  proposal: TransactionProposal
): PolicyResult {
  if (proposal.amountInPaise <= 0) {
    return { decision: "BLOCKED", requiresApproval: false, reason: "Transaction amount must be positive." };
  }
  if (proposal.amountInPaise > policy.maximumTransactionInPaise) {
    return {
      decision: "BLOCKED",
      requiresApproval: false,
      reason: `Amount ₹${paise(proposal.amountInPaise)} exceeds merchant policy maximum of ₹${paise(
        policy.maximumTransactionInPaise
      )} per transaction.`,
    };
  }
  return {
    decision: "ALLOWED",
    requiresApproval: !policy.automaticPayment,
    reason: policy.automaticPayment
      ? "Automatic payments enabled for this merchant; within transaction limit."
      : "Within transaction limit; merchant requires manual approval before payment execution.",
  };
}

/** Evaluate whether the agent may autonomously create an order. */
export function evaluateAgentOrderCreation(policy: MerchantPolicy): PolicyResult {
  if (!policy.agentCanCreateOrder) {
    return {
      decision: "BLOCKED",
      requiresApproval: false,
      reason: "Merchant policy disables agent-initiated order creation.",
    };
  }
  return { decision: "ALLOWED", requiresApproval: false, reason: "Agent is permitted to create orders under current policy." };
}

/** Evaluate a campaign proposal (discount envelope + approval requirement). */
export function evaluateCampaign(policy: MerchantPolicy, proposal: CampaignProposal): PolicyResult {
  if (proposal.discountInPaise > policy.maximumDiscountInPaise) {
    return {
      decision: "BLOCKED",
      requiresApproval: false,
      reason: `Per-customer discount ₹${paise(proposal.discountInPaise)} exceeds policy maximum ₹${paise(
        policy.maximumDiscountInPaise
      )}.`,
    };
  }
  return {
    decision: "ALLOWED",
    requiresApproval: policy.campaignRequiresApproval,
    reason: policy.campaignRequiresApproval
      ? "Campaign within limits; merchant approval required before execution."
      : "Campaign within limits; merchant policy allows automatic execution.",
  };
}

/** Evaluate whether the agent may propose/apply an upsell recommendation (never a money action by itself). */
export function evaluateUpsell(policy: MerchantPolicy): PolicyResult {
  if (!policy.upsellAllowed) {
    return { decision: "BLOCKED", requiresApproval: false, reason: "Merchant has disabled upsell recommendations." };
  }
  return { decision: "ALLOWED", requiresApproval: false, reason: "Upsell recommendations permitted." };
}

/** Evaluate whether an automatic refund may proceed. */
export function evaluateRefund(policy: MerchantPolicy): PolicyResult {
  if (!policy.automaticRefund) {
    return {
      decision: "ALLOWED",
      requiresApproval: true,
      reason: "Automatic refunds disabled; merchant approval required.",
    };
  }
  return { decision: "ALLOWED", requiresApproval: false, reason: "Automatic refunds enabled under merchant policy." };
}

function paise(amountInPaise: number): string {
  return (amountInPaise / 100).toLocaleString("en-IN");
}
