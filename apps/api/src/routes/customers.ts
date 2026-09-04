import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 25;
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: { merchantId },
        orderBy: { totalSpentInPaise: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customer.count({ where: { merchantId } }),
    ]);
    res.json({ customers, page, pageSize, total });
  })
);
