import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { runRevenueAgent } from "../ai/agent";

export const agentRouter = Router();
agentRouter.use(requireAuth);

const chatSchema = z.object({ message: z.string().min(1) });

agentRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const { message } = chatSchema.parse(req.body);
    const result = await runRevenueAgent(merchantId, message);
    res.json(result);
  })
);

agentRouter.get(
  "/runs",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const runs = await prisma.agentRun.findMany({
      where: { merchantId },
      include: { actions: true },
      orderBy: { startedAt: "desc" },
      take: 30,
    });
    res.json({ runs });
  })
);
