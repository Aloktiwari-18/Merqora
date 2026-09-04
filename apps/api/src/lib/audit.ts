import { prisma } from "./prisma";

export type AuditCategory = "AGENT" | "PAYMENT" | "CAMPAIGN" | "POLICY" | "APPROVAL" | "FAILURE" | "AUTH";
export type AuditStatus = "SUCCESS" | "BLOCKED" | "FAILED";

export interface AuditEntryInput {
  merchantId: string;
  category: AuditCategory;
  actor: string; // e.g. "agent:revenue_agent", "user:<id>", "system"
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
  status?: AuditStatus;
  agentRunId?: string;
}

/** Write a single human-readable audit trail entry. Never throws to the caller. */
export async function writeAuditLog(input: AuditEntryInput) {
  try {
    return await prisma.auditLog.create({
      data: {
        merchantId: input.merchantId,
        category: input.category,
        actor: input.actor,
        action: input.action,
        summary: input.summary,
        metadata: (input.metadata ?? {}) as any,
        status: input.status ?? "SUCCESS",
        agentRunId: input.agentRunId,
      },
    });
  } catch (err) {
    // Audit logging must never crash the primary request flow, but we still
    // want visibility, so we fall back to console.
    // eslint-disable-next-line no-console
    console.error("Failed to write audit log", err);
    return null;
  }
}
