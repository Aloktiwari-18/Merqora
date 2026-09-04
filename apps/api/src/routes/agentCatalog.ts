import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, AppError } from "../middleware/errorHandler";

export const agentCatalogRouter = Router();

/**
 * This router is intentionally structured for consumption by *other* AI
 * agents/buyers, not just humans — hence flat, well-typed JSON with no
 * pagination ceremony for small catalogs, and every field an AI shopper
 * would need to make a decision (price, inventory, return policy,
 * shipping, discount eligibility) inlined directly on the product.
 *
 * DEMO_MERCHANT_ID env resolves which merchant's catalog is exposed
 * publicly; falls back to the first seeded merchant if unset.
 */
async function resolveMerchantId(): Promise<string> {
  const envId = process.env.DEMO_MERCHANT_ID;
  if (envId) return envId;
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!merchant) throw new AppError(503, "NO_MERCHANT_SEEDED", "No merchant found. Run the seed script first.");
  return merchant.id;
}

function serialize(p: any) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.priceInPaise / 100,
    currency: p.currency,
    category: p.category,
    attributes: p.attributes,
    use_cases: p.useCases,
    inventory: p.inventory,
    availability: p.inventory > 0 ? "in_stock" : "out_of_stock",
    return_policy: p.returnPolicy,
    shipping_information: p.shippingInfo,
    discount_eligible: p.discountEligible,
  };
}

agentCatalogRouter.get(
  "/catalog",
  asyncHandler(async (_req, res) => {
    const merchantId = await resolveMerchantId();
    const [merchant, products] = await Promise.all([
      prisma.merchant.findUnique({ where: { id: merchantId } }),
      prisma.product.findMany({ where: { merchantId, isActive: true }, orderBy: { category: "asc" } }),
    ]);
    res.json({
      merchant: { id: merchant?.id, name: merchant?.name, currency: merchant?.currency },
      product_count: products.length,
      categories: Array.from(new Set(products.map((p) => p.category))),
      products: products.map(serialize),
    });
  })
);

agentCatalogRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const merchantId = await resolveMerchantId();
    const { category } = req.query as { category?: string };
    const products = await prisma.product.findMany({
      where: { merchantId, isActive: true, ...(category ? { category } : {}) },
    });
    res.json({ products: products.map(serialize) });
  })
);

agentCatalogRouter.get(
  "/products/search",
  asyncHandler(async (req, res) => {
    const merchantId = await resolveMerchantId();
    const { q, category, max_price, min_price } = req.query as Record<string, string | undefined>;
    const products = await prisma.product.findMany({
      where: {
        merchantId,
        isActive: true,
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
        ...(max_price ? { priceInPaise: { lte: Number(max_price) * 100 } } : {}),
        ...(min_price ? { priceInPaise: { gte: Number(min_price) * 100 } } : {}),
      },
      orderBy: { priceInPaise: "asc" },
    });
    res.json({ query: { q, category, max_price, min_price }, result_count: products.length, products: products.map(serialize) });
  })
);

agentCatalogRouter.get(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const merchantId = await resolveMerchantId();
    const product = await prisma.product.findFirst({ where: { id: req.params.id, merchantId } });
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found.");
    res.json({ product: serialize(product) });
  })
);

agentCatalogRouter.get(
  "/products/:id/inventory",
  asyncHandler(async (req, res) => {
    const merchantId = await resolveMerchantId();
    const product = await prisma.product.findFirst({ where: { id: req.params.id, merchantId } });
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found.");
    res.json({ product_id: product.id, inventory: product.inventory, availability: product.inventory > 0 ? "in_stock" : "out_of_stock" });
  })
);
