import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 25;
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { merchantId, ...(status ? { status } : {}) },
        include: { customer: true, items: { include: { product: true } }, payments: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where: { merchantId, ...(status ? { status } : {}) } }),
    ]);
    res.json({ orders, page, pageSize, total });
  })
);

ordersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, merchantId },
      include: { customer: true, items: { include: { product: true } }, payments: true },
    });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    res.json({ order });
  })
);
