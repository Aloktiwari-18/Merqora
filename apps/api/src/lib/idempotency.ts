import { randomUUID } from "crypto";
import { prisma } from "./prisma";

/** Generate a new idempotency key for a commerce operation. */
export function generateIdempotencyKey(): string {
  return `idem_${randomUUID()}`;
}

/**
 * Look up an existing Payment by idempotency key.
 * If found, the caller MUST return the existing record instead of creating
 * a new payment/order — this is what prevents duplicate charges when a
 * request is retried (double click, network retry, replayed webhook, etc).
 */
export async function findExistingPaymentByIdempotencyKey(idempotencyKey: string) {
  return prisma.payment.findUnique({
    where: { idempotencyKey },
    include: { order: { include: { items: true } } },
  });
}

/** Look up an existing Order by idempotency key (used for cart -> order creation). */
export async function findExistingOrderByIdempotencyKey(idempotencyKey: string) {
  return prisma.order.findUnique({
    where: { idempotencyKey },
    include: { items: true, payments: true },
  });
}
