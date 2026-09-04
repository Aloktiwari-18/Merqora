import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, AppError } from "../middleware/errorHandler";

export const cartRouter = Router();

async function resolveMerchantId(bodyMerchantId?: string): Promise<string> {
  if (bodyMerchantId) return bodyMerchantId;
  const envId = process.env.DEMO_MERCHANT_ID;
  if (envId) return envId;
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!merchant) throw new AppError(503, "NO_MERCHANT_SEEDED", "No merchant found. Run the seed script first.");
  return merchant.id;
}

function serializeCart(cart: any) {
  const subtotalInPaise = cart.items.reduce((s: number, i: any) => s + i.unitPriceInPaise * i.quantity, 0);
  return {
    id: cart.id,
    status: cart.status,
    items: cart.items.map((i: any) => ({
      id: i.id,
      productId: i.productId,
      name: i.product.name,
      quantity: i.quantity,
      unitPriceInPaise: i.unitPriceInPaise,
      lineTotalInPaise: i.unitPriceInPaise * i.quantity,
    })),
    subtotalInPaise,
  };
}

const createCartSchema = z.object({
  merchantId: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
});

cartRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createCartSchema.parse(req.body);
    const merchantId = await resolveMerchantId(input.merchantId);

    let customerId: string | undefined;
    if (input.customerEmail) {
      const customer = await prisma.customer.upsert({
        where: { merchantId_email: { merchantId, email: input.customerEmail } },
        update: {},
        create: { merchantId, email: input.customerEmail, name: input.customerName || input.customerEmail },
      });
      customerId = customer.id;
    }

    const cart = await prisma.cart.create({ data: { merchantId, customerId }, include: { items: { include: { product: true } } } });
    res.status(201).json({ cart: serializeCart(cart) });
  })
);

cartRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const cart = await prisma.cart.findUnique({ where: { id: req.params.id }, include: { items: { include: { product: true } } } });
    if (!cart) throw new AppError(404, "CART_NOT_FOUND", "Cart not found.");
    res.json({ cart: serializeCart(cart) });
  })
);

const addItemSchema = z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20).default(1) });

cartRouter.post(
  "/:id/items",
  asyncHandler(async (req, res) => {
    const cart = await prisma.cart.findUnique({ where: { id: req.params.id } });
    if (!cart) throw new AppError(404, "CART_NOT_FOUND", "Cart not found.");
    if (cart.status !== "ACTIVE") throw new AppError(409, "CART_NOT_ACTIVE", "This cart is no longer active.");

    const { productId, quantity } = addItemSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found.");
    if (product.inventory < quantity) {
      throw new AppError(409, "INSUFFICIENT_INVENTORY", `Only ${product.inventory} units of "${product.name}" are available.`);
    }

    const existing = await prisma.cartItem.findFirst({ where: { cartId: cart.id, productId } });
    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } });
    } else {
      await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity, unitPriceInPaise: product.priceInPaise } });
    }
    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

    const updated = await prisma.cart.findUnique({ where: { id: cart.id }, include: { items: { include: { product: true } } } });
    res.json({ cart: serializeCart(updated) });
  })
);

cartRouter.delete(
  "/:id/items/:itemId",
  asyncHandler(async (req, res) => {
    await prisma.cartItem.delete({ where: { id: req.params.itemId } }).catch(() => {
      throw new AppError(404, "ITEM_NOT_FOUND", "Cart item not found.");
    });
    const cart = await prisma.cart.findUnique({ where: { id: req.params.id }, include: { items: { include: { product: true } } } });
    if (!cart) throw new AppError(404, "CART_NOT_FOUND", "Cart not found.");
    res.json({ cart: serializeCart(cart) });
  })
);
