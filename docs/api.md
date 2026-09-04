# Merqora — API Documentation

Base URL (local dev): `http://localhost:4000/api`

All authenticated endpoints require `Authorization: Bearer <token>`.
All request/response bodies are JSON unless noted. Errors follow:

```json
{ "error": { "code": "SOME_CODE", "message": "Human readable message." } }
```

## Auth

### `POST /auth/register`
Body: `{ name, email, password, merchantName }` → creates a new Merchant + ADMIN user.

### `POST /auth/login`
Body: `{ email, password }` → `{ token, user }`

### `POST /auth/demo-login`
No body. Logs into the seeded demo merchant (`demo@merqora.dev`).

## Dashboard

### `GET /dashboard` 🔒
Returns revenue, orders, conversion rate, AOV, abandoned cart value, failed
payment value, AI revenue opportunity, a 30-day revenue series, recent
orders, recent agent activity, and recent campaigns — all computed live from
the database.

## Products

### `GET /products` 🔒
Query: `?category=&q=`

### `POST /products` 🔒 (ADMIN/MERCHANT)
Body: `{ name, description, category, priceInPaise, inventory, useCases }`

### `GET /products/:id` 🔒

## Customers

### `GET /customers` 🔒
Query: `?page=`

## Orders

### `GET /orders` 🔒
Query: `?status=&page=`

### `GET /orders/:id` 🔒

## Agent-readable catalog (public, unauthenticated)

Designed for consumption by other AI agents/buyers.

### `GET /agent/catalog`
Full catalog with merchant info, category list, and every product.

### `GET /agent/products`
Query: `?category=`

### `GET /agent/products/search`
Query: `?q=&category=&min_price=&max_price=` (prices in ₹, not paise)

### `GET /agent/products/:id`

### `GET /agent/products/:id/inventory`

## Revenue Agent ("Nova") 🔒

### `POST /agent/chat`
Body: `{ message }` → `{ agentRunId, response, actions, modelUsed }`

### `GET /agent/runs`
Recent agent runs with their tool-call actions, for debugging/audit.

## AI Buyer ("Sable") — public

### `POST /buyer/chat`
Body: `{ message, merchantId? }` → `{ agentRunId, reasoning, products }`

### `POST /buyer/upsell`
Body: `{ productId, merchantId? }` → `{ allowed, recommendations }`

## Cart — public

### `POST /cart`
Body: `{ merchantId?, customerName?, customerEmail? }` → `{ cart }`

### `GET /cart/:id`

### `POST /cart/:id/items`
Body: `{ productId, quantity }`

### `DELETE /cart/:id/items/:itemId`

## Checkout — public

### `POST /checkout/create`
Header: `Idempotency-Key` (required)
Body: `{ cartId, campaignId? }` → `{ order, idempotent }`

Re-validates inventory, evaluates the transaction against merchant policy,
and applies a discount only if `campaignId` references an **APPROVED**
campaign whose discount still passes `evaluateDiscount`.

## Payment — public

### `GET /payment/config`
`{ keyId, mode }` — `keyId` is the **public** Razorpay key id (or `null` in
mock mode). The secret key is never sent to the frontend.

### `POST /payment/create`
Header: `Idempotency-Key` (required)
Body: `{ orderId }` → `{ payment, razorpayOrderId, amountInPaise, currency, keyId, mode }`

### `POST /payment/mock-complete` (mock mode only)
Body: `{ razorpayOrderId, simulateFailure? }` — generates a validly-signed
mock payment completion, simulating what Razorpay's checkout.js would
return, for local development without real credentials.

### `POST /payment/verify`
Body: `{ razorpayOrderId, razorpayPaymentId, razorpaySignature }` — verifies
the HMAC signature server-side; only marks the order `PAID` if valid.

## Webhooks

### `POST /webhooks/razorpay`
Raw body (not JSON-parsed by the time it reaches the route) + header
`x-razorpay-signature`. Verifies the signature against
`RAZORPAY_WEBHOOK_SECRET`, records a `WebhookEvent` row regardless of
validity, and reconciles the corresponding `Payment`/`Order` idempotently.

## Audit 🔒

### `GET /audit`
Query: `?category=&status=&page=` — `category` ∈ `AGENT | PAYMENT | CAMPAIGN | POLICY | APPROVAL | FAILURE | AUTH`

## Policies 🔒

### `GET /policies`

### `PUT /policies` (ADMIN/MERCHANT)
Body: any subset of `{ maximumDiscountInPaise, maximumTransactionInPaise, automaticPayment, automaticRefund, campaignRequiresApproval, upsellAllowed, agentCanCreateOrder }`

## Campaigns 🔒

### `GET /campaigns`

### `POST /campaigns/propose`
Body: `{ title, goal, offerDescription, discountInPaise }` — evaluated
against policy; creates an `AgentRun` + `AgentAction` (+ `AgentApproval` if
required) alongside the `Campaign` row.

### `POST /campaigns/:id/approve` (ADMIN/MERCHANT)

### `POST /campaigns/:id/reject` (ADMIN/MERCHANT)

### `PUT /campaigns/:id` (ADMIN/MERCHANT) — edit a still-`PROPOSED` campaign

## Failure Lab 🔒

All endpoints are `POST /failure-lab/simulate/<scenario>` with no body,
returning `{ scenario, steps, finalState }`:

- `payment-failure`
- `inventory-changed`
- `duplicate-request`
- `api-timeout`
- `webhook-delay`
- `invalid-discount`
- `product-unavailable`
- `llm-timeout`

Each simulation performs **real** database operations (creates real
Orders/Payments/Carts, calls the real policy engine and Razorpay mock
adapter) rather than returning canned text, and writes a real `AuditLog`
entry.
