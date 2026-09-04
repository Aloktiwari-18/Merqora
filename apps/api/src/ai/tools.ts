/**
 * Agent tools.
 *
 * Every tool here is a plain, deterministic TypeScript function backed by
 * real Prisma queries against the seeded database. The LLM never receives
 * raw DB/SQL access — it can only call these named, schema-validated tools.
 * None of these tools mutate payment or order state; money-moving actions
 * always go through the policy engine + approval workflow separately.
 */

import { z } from "zod";
import { prisma } from "../lib/prisma";
import { evaluateDiscount, evaluateCampaign } from "../lib/policyEngine";

const merchantScoped = z.object({ merchantId: z.string() });

export const toolSchemas = {
  get_revenue_summary: merchantScoped.extend({
    days: z.number().int().min(1).max(365).default(30),
  }),
  get_sales_trends: merchantScoped.extend({
    days: z.number().int().min(1).max(365).default(30),
  }),
  get_top_products: merchantScoped.extend({
    limit: z.number().int().min(1).max(20).default(5),
  }),
  get_customer_segments: merchantScoped,
  get_abandoned_carts: merchantScoped.extend({
    minValueInPaise: z.number().int().min(0).default(0),
  }),
  get_failed_payments: merchantScoped.extend({
    days: z.number().int().min(1).max(365).default(30),
  }),
  search_products: merchantScoped.extend({
    query: z.string().optional(),
    category: z.string().optional(),
    maxPriceInPaise: z.number().int().optional(),
    minPriceInPaise: z.number().int().optional(),
  }),
  get_product_details: merchantScoped.extend({
    productId: z.string(),
  }),
  check_inventory: merchantScoped.extend({
    productId: z.string(),
  }),
  calculate_discount: merchantScoped.extend({
    cartValueInPaise: z.number().int().min(0),
    proposedDiscountInPaise: z.number().int().min(0),
  }),
  get_merchant_policy: merchantScoped,
  create_campaign_proposal: merchantScoped.extend({
    title: z.string(),
    goal: z.string(),
    offerDescription: z.string(),
    discountInPaise: z.number().int().min(0),
  }),
} as const;

export type ToolName = keyof typeof toolSchemas;

async function get_revenue_summary(args: z.infer<typeof toolSchemas.get_revenue_summary>) {
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { merchantId: args.merchantId, status: "PAID", createdAt: { gte: since } },
    select: { totalInPaise: true },
  });
  const revenueInPaise = orders.reduce((sum, o) => sum + o.totalInPaise, 0);
  const failedPayments = await prisma.payment.count({
    where: { status: "FAILED", createdAt: { gte: since }, order: { merchantId: args.merchantId } },
  });
  const abandonedCarts = await prisma.cart.count({
    where: { merchantId: args.merchantId, status: "ABANDONED", updatedAt: { gte: since } },
  });
  return {
    periodDays: args.days,
    revenueInPaise,
    ordersCount: orders.length,
    averageOrderValueInPaise: orders.length ? Math.round(revenueInPaise / orders.length) : 0,
    failedPaymentsCount: failedPayments,
    abandonedCartsCount: abandonedCarts,
  };
}

async function get_sales_trends(args: z.infer<typeof toolSchemas.get_sales_trends>) {
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { merchantId: args.merchantId, status: "PAID", createdAt: { gte: since } },
    select: { totalInPaise: true, createdAt: true },
  });
  const byDay = new Map<string, { revenueInPaise: number; orders: number }>();
  for (const o of orders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { revenueInPaise: 0, orders: 0 };
    bucket.revenueInPaise += o.totalInPaise;
    bucket.orders += 1;
    byDay.set(day, bucket);
  }
  const byDayOfWeek = new Map<string, number>();
  for (const o of orders) {
    const dow = o.createdAt.toLocaleDateString("en-US", { weekday: "long" });
    byDayOfWeek.set(dow, (byDayOfWeek.get(dow) ?? 0) + o.totalInPaise);
  }
  return {
    dailySeries: Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
    revenueByDayOfWeek: Object.fromEntries(byDayOfWeek),
  };
}

async function get_top_products(args: z.infer<typeof toolSchemas.get_top_products>) {
  const items = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { merchantId: args.merchantId, status: "PAID" } },
    _sum: { quantity: true, unitPriceInPaise: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: args.limit,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
  });
  return items.map((i) => {
    const p = products.find((p) => p.id === i.productId);
    return {
      productId: i.productId,
      name: p?.name ?? "Unknown product",
      category: p?.category,
      unitsSold: i._sum.quantity ?? 0,
      currentInventory: p?.inventory ?? 0,
    };
  });
}

async function get_customer_segments(args: z.infer<typeof toolSchemas.get_customer_segments>) {
  const segments = await prisma.customer.groupBy({
    by: ["segment"],
    where: { merchantId: args.merchantId },
    _count: { _all: true },
    _sum: { totalSpentInPaise: true },
  });
  return segments.map((s) => ({
    segment: s.segment,
    customerCount: s._count._all,
    totalSpentInPaise: s._sum.totalSpentInPaise ?? 0,
  }));
}

async function get_abandoned_carts(args: z.infer<typeof toolSchemas.get_abandoned_carts>) {
  const carts = await prisma.cart.findMany({
    where: { merchantId: args.merchantId, status: "ABANDONED" },
    include: { items: true, customer: true },
    take: 200,
  });
  const withValue = carts
    .map((c) => ({
      cartId: c.id,
      customerId: c.customerId,
      customerName: c.customer?.name ?? "Guest",
      cartValueInPaise: c.items.reduce((s, i) => s + i.unitPriceInPaise * i.quantity, 0),
      updatedAt: c.updatedAt,
    }))
    .filter((c) => c.cartValueInPaise >= args.minValueInPaise);
  return {
    count: withValue.length,
    totalValueInPaise: withValue.reduce((s, c) => s + c.cartValueInPaise, 0),
    carts: withValue.slice(0, 25),
  };
}

async function get_failed_payments(args: z.infer<typeof toolSchemas.get_failed_payments>) {
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  const payments = await prisma.payment.findMany({
    where: { status: "FAILED", createdAt: { gte: since }, order: { merchantId: args.merchantId } },
    include: { order: true },
    take: 50,
  });
  return {
    count: payments.length,
    totalAttemptedInPaise: payments.reduce((s, p) => s + p.amountInPaise, 0),
    payments: payments.map((p) => ({
      paymentId: p.id,
      orderId: p.orderId,
      amountInPaise: p.amountInPaise,
      failureReason: p.failureReason,
      createdAt: p.createdAt,
    })),
  };
}

async function search_products(args: z.infer<typeof toolSchemas.search_products>) {
  // Natural-language queries rarely match a product name as one exact
  // substring (e.g. "noise cancelling headphones" vs "Noise-Cancelling
  // Headphones Pro" — the hyphen alone breaks a whole-phrase `contains`).
  // Instead, split the query into significant words and match a product if
  // ANY word appears in its name, description, or use cases.
  const queryWords = (args.query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2);

  const wordConditions = queryWords.flatMap((word) => [
    { name: { contains: word, mode: "insensitive" as const } },
    { description: { contains: word, mode: "insensitive" as const } },
    { useCases: { hasSome: [word] } },
  ]);

  const products = await prisma.product.findMany({
    where: {
      merchantId: args.merchantId,
      isActive: true,
      ...(args.category ? { category: { equals: args.category, mode: "insensitive" } } : {}),
      ...(wordConditions.length > 0 ? { OR: wordConditions } : {}),
      ...(args.maxPriceInPaise ? { priceInPaise: { lte: args.maxPriceInPaise } } : {}),
      ...(args.minPriceInPaise ? { priceInPaise: { gte: args.minPriceInPaise } } : {}),
    },
    take: 20,
    orderBy: { priceInPaise: "asc" },
  });
  return products.map(serializeProduct);
}

async function get_product_details(args: z.infer<typeof toolSchemas.get_product_details>) {
  const product = await prisma.product.findFirst({ where: { id: args.productId, merchantId: args.merchantId } });
  if (!product) return { error: "Product not found." };
  return serializeProduct(product);
}

async function check_inventory(args: z.infer<typeof toolSchemas.check_inventory>) {
  const product = await prisma.product.findFirst({ where: { id: args.productId, merchantId: args.merchantId } });
  if (!product) return { error: "Product not found." };
  return { productId: product.id, inventory: product.inventory, available: product.inventory > 0 };
}

async function calculate_discount(args: z.infer<typeof toolSchemas.calculate_discount>) {
  const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId: args.merchantId } });
  if (!policy) return { error: "No policy configured for this merchant." };
  const result = evaluateDiscount(policy, {
    discountInPaise: args.proposedDiscountInPaise,
    cartValueInPaise: args.cartValueInPaise,
  });
  return {
    proposedDiscountInPaise: args.proposedDiscountInPaise,
    policyMaximumInPaise: policy.maximumDiscountInPaise,
    decision: result.decision,
    reason: result.reason,
  };
}

async function get_merchant_policy(args: z.infer<typeof toolSchemas.get_merchant_policy>) {
  const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId: args.merchantId } });
  return policy ?? { error: "No policy configured." };
}

async function create_campaign_proposal(args: z.infer<typeof toolSchemas.create_campaign_proposal>) {
  const policy = await prisma.merchantPolicy.findUnique({ where: { merchantId: args.merchantId } });
  if (!policy) return { error: "No policy configured for this merchant." };

  const abandoned = await get_abandoned_carts({ merchantId: args.merchantId, minValueInPaise: 0 });
  const estimatedRecoverableInPaise = Math.round(abandoned.totalValueInPaise * 0.35); // conservative recovery-rate assumption, documented in docs/architecture.md

  const evaluation = evaluateCampaign(policy, {
    discountInPaise: args.discountInPaise,
    estimatedRecoverableInPaise,
    audienceSize: abandoned.count,
  });

  // NOTE: this tool only PROPOSES — it does not create a persisted Campaign
  // row itself. The route handler persists the Campaign (status=PROPOSED)
  // after receiving this structured proposal, so campaign creation always
  // goes through the same policy + audit path regardless of caller.
  return {
    title: args.title,
    goal: args.goal,
    offerDescription: args.offerDescription,
    discountInPaise: args.discountInPaise,
    audienceSize: abandoned.count,
    estimatedRecoverableInPaise,
    riskLevel: abandoned.count > 500 ? "HIGH" : abandoned.count > 100 ? "MEDIUM" : "LOW",
    policyDecision: evaluation.decision,
    requiresApproval: evaluation.requiresApproval,
    policyReason: evaluation.reason,
  };
}

function serializeProduct(p: {
  id: string;
  name: string;
  description: string;
  category: string;
  priceInPaise: number;
  currency: string;
  inventory: number;
  attributes: unknown;
  useCases: string[];
  returnPolicy: string;
  shippingInfo: string;
  discountEligible: boolean;
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    priceInPaise: p.priceInPaise,
    currency: p.currency,
    attributes: p.attributes,
    useCases: p.useCases,
    inventory: p.inventory,
    availability: p.inventory > 0 ? "in_stock" : "out_of_stock",
    returnPolicy: p.returnPolicy,
    shippingInfo: p.shippingInfo,
    discountEligible: p.discountEligible,
  };
}

export const toolImplementations: Record<ToolName, (args: any) => Promise<unknown>> = {
  get_revenue_summary,
  get_sales_trends,
  get_top_products,
  get_customer_segments,
  get_abandoned_carts,
  get_failed_payments,
  search_products,
  get_product_details,
  check_inventory,
  calculate_discount,
  get_merchant_policy,
  create_campaign_proposal,
};

export async function callTool(name: ToolName, rawArgs: unknown) {
  const schema = toolSchemas[name];
  const parsed = schema.parse(rawArgs);
  return toolImplementations[name](parsed);
}