import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { evaluateCampaign } from "../lib/policyEngine";
import { writeAuditLog } from "../lib/audit";
import { callTool } from "../ai/tools";

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

campaignsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const campaigns = await prisma.campaign.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" } });
    res.json({ campaigns });
  })
);

const proposeSchema = z.object({
  title: z.string().min(2),
  goal: z.string().min(2),
  offerDescription: z.string().min(2),
  discountInPaise: z.number().int().min(0),
});

/**
 * Persist an AI-proposed (or manually drafted) campaign after policy
 * evaluation. Never auto-executes.
 *
 * This route is the concrete implementation of the Flow 8 architecture:
 *   AI (agent run) -> Action Proposal (AgentAction) -> Policy Engine
 *   -> Risk Evaluation -> Approval if required (AgentApproval) -> Audit Log
 * The Campaign row itself only ever reaches EXECUTING/COMPLETED once a
 * human explicitly approves it via POST /:id/approve below.
 */
campaignsRouter.post(
  "/propose",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const input = proposeSchema.parse(req.body);

    const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId } });
    if (!policy) throw new AppError(503, "NO_POLICY", "Merchant policy not configured.");

    // Every proposal is tracked as its own governance run, even when it
    // originates from a human drafting a campaign directly in the UI
    // rather than from a Nova chat message.
    const agentRun = await prisma.agentRun.create({
      data: {
        merchantId,
        agentType: "campaign_orchestrator",
        userMessage: `Propose campaign: ${input.title}`,
        status: "RUNNING",
      },
    });

    const abandoned = (await callTool("get_abandoned_carts", { merchantId, minValueInPaise: 0 })) as any;
    const estimatedRecoverableInPaise = Math.round(abandoned.totalValueInPaise * 0.35);

    const evaluation = evaluateCampaign(policy, {
      discountInPaise: input.discountInPaise,
      estimatedRecoverableInPaise,
      audienceSize: abandoned.count,
    });

    const agentAction = await prisma.agentAction.create({
      data: {
        agentRunId: agentRun.id,
        actionType: "CAMPAIGN_PROPOSAL",
        input: input as any,
        amountInPaise: input.discountInPaise,
        reason: input.goal,
        policyEvaluated: "evaluateCampaign",
        policyResult: evaluation.decision,
        approvalStatus: evaluation.decision === "BLOCKED" ? "NOT_REQUIRED" : evaluation.requiresApproval ? "PENDING" : "NOT_REQUIRED",
        finalStatus: evaluation.decision === "BLOCKED" ? "BLOCKED" : "PENDING",
      },
    });

    if (evaluation.decision === "BLOCKED") {
      await prisma.agentRun.update({ where: { id: agentRun.id }, data: { status: "COMPLETED", finalResponse: evaluation.reason, completedAt: new Date() } });
      await writeAuditLog({
        merchantId,
        category: "CAMPAIGN",
        actor: `user:${req.user!.userId}`,
        action: "CAMPAIGN_PROPOSAL_BLOCKED",
        summary: `Campaign proposal "${input.title}" blocked by policy: ${evaluation.reason}`,
        agentRunId: agentRun.id,
        status: "BLOCKED",
      });
      throw new AppError(403, "CAMPAIGN_BLOCKED_BY_POLICY", evaluation.reason);
    }

    const campaign = await prisma.campaign.create({
      data: {
        merchantId,
        title: input.title,
        goal: input.goal,
        offerDescription: input.offerDescription,
        discountInPaise: input.discountInPaise,
        estimatedRecoverableInPaise,
        riskLevel: abandoned.count > 500 ? "HIGH" : abandoned.count > 100 ? "MEDIUM" : "LOW",
        status: "PROPOSED",
        createdByAgentRunId: agentRun.id,
        audience: {
          create: abandoned.carts.slice(0, 200).map((c: any) => ({ customerId: c.customerId, cartValueInPaise: c.cartValueInPaise })).filter((a: any) => a.customerId),
        },
      },
    });

    if (evaluation.requiresApproval) {
      await prisma.agentApproval.create({ data: { agentActionId: agentAction.id } });
    }

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "COMPLETED", finalResponse: `Campaign proposal created (${campaign.id}). ${evaluation.reason}`, completedAt: new Date() },
    });

    await writeAuditLog({
      merchantId,
      category: "CAMPAIGN",
      actor: `user:${req.user!.userId}`,
      action: "CAMPAIGN_PROPOSED",
      summary: `Campaign "${campaign.title}" proposed — ₹${(input.discountInPaise / 100).toLocaleString("en-IN")} discount, est. recoverable ₹${(estimatedRecoverableInPaise / 100).toLocaleString("en-IN")}. Policy: ${evaluation.reason}`,
      metadata: { campaignId: campaign.id, requiresApproval: evaluation.requiresApproval, agentActionId: agentAction.id },
      agentRunId: agentRun.id,
      status: "SUCCESS",
    });

    res.status(201).json({ campaign, requiresApproval: evaluation.requiresApproval, policyReason: evaluation.reason, agentActionId: agentAction.id });
  })
);

campaignsRouter.post(
  "/:id/approve",
  requireRole("ADMIN", "MERCHANT"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, merchantId } });
    if (!campaign) throw new AppError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    if (campaign.status !== "PROPOSED") throw new AppError(409, "INVALID_STATE", `Campaign is in status ${campaign.status}, cannot approve.`);

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "APPROVED", approvedByUserId: req.user!.userId },
    });

    if (campaign.createdByAgentRunId) {
      const pendingApproval = await prisma.agentApproval.findFirst({
        where: { agentAction: { agentRunId: campaign.createdByAgentRunId }, decision: "PENDING" },
      });
      if (pendingApproval) {
        await prisma.agentApproval.update({
          where: { id: pendingApproval.id },
          data: { decision: "APPROVED", decidedAt: new Date(), decidedByUserId: req.user!.userId },
        });
        await prisma.agentAction.update({ where: { id: pendingApproval.agentActionId }, data: { approvalStatus: "APPROVED", finalStatus: "SUCCESS" } });
      }
    }

    await writeAuditLog({
      merchantId,
      category: "APPROVAL",
      actor: `user:${req.user!.userId}`,
      action: "CAMPAIGN_APPROVED",
      summary: `Campaign "${campaign.title}" approved by merchant. It can now be redeemed at checkout.`,
      metadata: { campaignId: campaign.id },
      status: "SUCCESS",
    });

    res.json({ campaign: updated });
  })
);

campaignsRouter.post(
  "/:id/reject",
  requireRole("ADMIN", "MERCHANT"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, merchantId } });
    if (!campaign) throw new AppError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    if (campaign.status !== "PROPOSED") throw new AppError(409, "INVALID_STATE", `Campaign is in status ${campaign.status}, cannot reject.`);

    const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "REJECTED" } });

    if (campaign.createdByAgentRunId) {
      const pendingApproval = await prisma.agentApproval.findFirst({
        where: { agentAction: { agentRunId: campaign.createdByAgentRunId }, decision: "PENDING" },
      });
      if (pendingApproval) {
        await prisma.agentApproval.update({
          where: { id: pendingApproval.id },
          data: { decision: "REJECTED", decidedAt: new Date(), decidedByUserId: req.user!.userId },
        });
        await prisma.agentAction.update({ where: { id: pendingApproval.agentActionId }, data: { approvalStatus: "REJECTED", finalStatus: "BLOCKED" } });
      }
    }

    await writeAuditLog({
      merchantId,
      category: "APPROVAL",
      actor: `user:${req.user!.userId}`,
      action: "CAMPAIGN_REJECTED",
      summary: `Campaign "${campaign.title}" rejected by merchant.`,
      metadata: { campaignId: campaign.id },
      status: "SUCCESS",
    });

    res.json({ campaign: updated });
  })
);

const editSchema = z.object({
  title: z.string().min(2).optional(),
  offerDescription: z.string().min(2).optional(),
  discountInPaise: z.number().int().min(0).optional(),
});

campaignsRouter.put(
  "/:id",
  requireRole("ADMIN", "MERCHANT"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, merchantId } });
    if (!campaign) throw new AppError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    if (campaign.status !== "PROPOSED") throw new AppError(409, "INVALID_STATE", "Only proposed campaigns can be edited.");

    const input = editSchema.parse(req.body);
    if (input.discountInPaise !== undefined) {
      const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId } });
      const evaluation = evaluateCampaign(policy!, {
        discountInPaise: input.discountInPaise,
        estimatedRecoverableInPaise: campaign.estimatedRecoverableInPaise,
        audienceSize: 0,
      });
      if (evaluation.decision === "BLOCKED") throw new AppError(403, "CAMPAIGN_BLOCKED_BY_POLICY", evaluation.reason);
    }

    const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: input });
    await writeAuditLog({
      merchantId,
      category: "CAMPAIGN",
      actor: `user:${req.user!.userId}`,
      action: "CAMPAIGN_EDITED",
      summary: `Campaign "${campaign.title}" edited by merchant.`,
      metadata: { campaignId: campaign.id, changes: input },
      status: "SUCCESS",
    });
    res.json({ campaign: updated });
  })
);
