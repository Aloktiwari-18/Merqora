import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export const auditRouter = Router();
auditRouter.use(requireAuth);

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const { category, status } = req.query as { category?: string; status?: string };
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 50;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { merchantId, ...(category ? { category } : {}), ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where: { merchantId, ...(category ? { category } : {}), ...(status ? { status } : {}) } }),
    ]);

    res.json({ logs, page, pageSize, total });
  })
);
