import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword, signToken } from "../lib/auth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { writeAuditLog } from "../lib/audit";

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
    }
    const token = signToken({ userId: user.id, merchantId: user.merchantId, role: user.role, email: user.email });
    if (user.merchantId) {
      await writeAuditLog({
        merchantId: user.merchantId,
        category: "AUTH",
        actor: `user:${user.id}`,
        action: "LOGIN",
        summary: `${user.name} logged in.`,
        status: "SUCCESS",
      });
    }
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, merchantId: user.merchantId } });
  })
);

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  merchantName: z.string().min(2),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }
    const slug = input.merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);

    const merchant = await prisma.merchant.create({ data: { name: input.merchantName, slug } });
    await prisma.merchantPolicy.create({ data: { merchantId: merchant.id } });

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: "ADMIN", merchantId: merchant.id },
    });

    await writeAuditLog({
      merchantId: merchant.id,
      category: "AUTH",
      actor: `user:${user.id}`,
      action: "REGISTER",
      summary: `${user.name} registered a new merchant account "${merchant.name}".`,
      status: "SUCCESS",
    });

    const token = signToken({ userId: user.id, merchantId: user.merchantId, role: user.role, email: user.email });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, merchantId: user.merchantId } });
  })
);

/** Convenience endpoint: logs into the seeded demo merchant account. */
authRouter.post(
  "/demo-login",
  asyncHandler(async (_req, res) => {
    const user = await prisma.user.findUnique({ where: { email: "demo@merqora.dev" } });
    if (!user) {
      throw new AppError(404, "DEMO_NOT_SEEDED", "Demo account not found. Run `npm run db:seed` first.");
    }
    const token = signToken({ userId: user.id, merchantId: user.merchantId, role: user.role, email: user.email });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, merchantId: user.merchantId } });
  })
);
