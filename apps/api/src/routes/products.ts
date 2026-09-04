import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const { category, q } = req.query as { category?: string; q?: string };
    const products = await prisma.product.findMany({
      where: {
        merchantId,
        ...(category ? { category } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ products });
  })
);

const createProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(1),
  category: z.string().min(1),
  priceInPaise: z.number().int().positive(),
  inventory: z.number().int().min(0).default(0),
  useCases: z.array(z.string()).default([]),
});

productsRouter.post(
  "/",
  requireRole("ADMIN", "MERCHANT"),
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const input = createProductSchema.parse(req.body);
    const product = await prisma.product.create({ data: { merchantId, ...input } });
    res.status(201).json({ product });
  })
);

productsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.merchantId!;
    const product = await prisma.product.findFirst({ where: { id: req.params.id, merchantId } });
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found.");
    res.json({ product });
  })
);
