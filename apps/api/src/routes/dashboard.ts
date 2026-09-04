import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId;
    if (!merchantId) throw new AppError(400, "NO_MERCHANT", "User is not associated with a merchant.");

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [paidOrders, allOrdersCount, abandonedCarts, failedPayments, opportunities, recentOrders, recentAgentRuns, campaigns] =
      await Promise.all([
        prisma.order.findMany({ where: { merchantId, status: "PAID", createdAt: { gte: since30 } }, select: { totalInPaise: true, createdAt: true } }),
        prisma.order.count({ where: { merchantId, createdAt: { gte: since30 } } }),
        prisma.cart.findMany({ where: { merchantId, status: "ABANDONED" }, include: { items: true } }),
        prisma.payment.findMany({ where: { status: "FAILED", createdAt: { gte: since30 }, order: { merchantId } } }),
        prisma.campaign.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 5 }),
        prisma.order.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 8, include: { customer: true } }),
        prisma.agentRun.findMany({ where: { merchantId }, orderBy: { startedAt: "desc" }, take: 8 }),
        prisma.campaign.count({ where: { merchantId, status: { in: ["APPROVED", "EXECUTING", "COMPLETED"] } } }),
      ]);

    const revenueInPaise = paidOrders.reduce((s, o) => s + o.totalInPaise, 0);
    const abandonedValueInPaise = abandonedCarts.reduce((s, c) => s + c.items.reduce((s2, i) => s2 + i.unitPriceInPaise * i.quantity, 0), 0);
    const failedValueInPaise = failedPayments.reduce((s, p) => s + p.amountInPaise, 0);

    const dailyRevenue = new Map<string, number>();
    for (const o of paidOrders) {
      const day = o.createdAt.toISOString().slice(0, 10);
      dailyRevenue.set(day, (dailyRevenue.get(day) ?? 0) + o.totalInPaise);
    }

    res.json({
      revenueInPaise,
      ordersCount: paidOrders.length,
      totalOrdersCount: allOrdersCount,
      conversionRate: allOrdersCount > 0 ? Number(((paidOrders.length / allOrdersCount) * 100).toFixed(1)) : 0,
      averageOrderValueInPaise: paidOrders.length ? Math.round(revenueInPaise / paidOrders.length) : 0,
      abandonedCartValueInPaise: abandonedValueInPaise,
      abandonedCartsCount: abandonedCarts.length,
      failedPaymentValueInPaise: failedValueInPaise,
      failedPaymentsCount: failedPayments.length,
      aiRevenueOpportunityInPaise: Math.round(abandonedValueInPaise * 0.35),
      revenueSeries: Array.from(dailyRevenue.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, revenueInPaise]) => ({ date, revenueInPaise })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        customerName: o.customer?.name ?? "Guest",
        totalInPaise: o.totalInPaise,
        status: o.status,
        createdAt: o.createdAt,
      })),
      recentAgentActivity: recentAgentRuns.map((r) => ({
        id: r.id,
        agentType: r.agentType,
        userMessage: r.userMessage,
        status: r.status,
        startedAt: r.startedAt,
      })),
      recentCampaigns: opportunities.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        estimatedRecoverableInPaise: c.estimatedRecoverableInPaise,
      })),
      activeCampaignsCount: campaigns,
    });
  })
);
