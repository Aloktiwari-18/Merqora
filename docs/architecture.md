# Merqora — Architecture

## 1. Core principle

> **AI proposes. Policy decides. Humans approve sensitive actions. Code executes money movement. Audit records everything.**

Every money-adjacent feature in Merqora is built around this pipeline:

```
        AI (Nova / Sable / Campaign Orchestrator)
                    │
                    ▼
           Action Proposal (AgentAction)
                    │
                    ▼
     Policy Engine  (src/lib/policyEngine.ts — pure TS, no LLM)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
     BLOCKED                 ALLOWED
   (stop here,          requiresApproval? ──yes──▶ AgentApproval (PENDING)
    audit + return)             │                        │
                                no                  human approves/rejects
                                │                        │
                                ▼                        ▼
                      Payment / Commerce Action ◀────────┘
                                │
                                ▼
                            Audit Log
```

The policy engine (`evaluateDiscount`, `evaluateTransaction`, `evaluateCampaign`,
`evaluateAgentOrderCreation`, `evaluateUpsell`, `evaluateRefund`) is **100%
deterministic TypeScript**. No LLM call happens inside that file, and it must
stay that way — this is the actual safety boundary of the product, not a
suggestion to the model.

## 2. Why integer paise instead of Prisma `Decimal`

The brief asks for `Decimal` money fields. Merqora instead stores every
monetary amount as an **integer number of paise** (1/100 of a rupee) — e.g.
`₹429.00` is stored as `42900`.

Reasons:

1. **It's exactly Razorpay's own convention.** Razorpay's API expects/returns
   `amount` in the smallest currency unit. Storing paise means zero conversion,
   zero rounding, at the payment boundary — the single place money bugs are
   most dangerous.
2. **Prisma's `Decimal` type isn't supported by every provider** the same way,
   and still requires careful `Decimal.js`-style arithmetic everywhere it's
   touched. Plain integers avoid floating-point error entirely with ordinary
   `+`/`-`/`*` and no library dependency.
3. It is a common, well-understood pattern in real payment systems (Stripe
   does the same with cents).

Money is **never** stored as `Float`/`Decimal` anywhere in this codebase.

## 3. AI agent architecture

```
apps/api/src/ai/
  tools.ts        — Zod-validated tool schemas + implementations (real Prisma reads only)
  agent.ts         — Nova (Revenue Agent): Groq (free-tier) tool-calling loop, or rule-based fallback
  buyerAgent.ts    — Sable (AI Buyer): intent parsing + catalog search, optional Claude reasoning summary
```

The model **never** gets raw SQL or a generic "run a query" tool. It can only
call the named tools in `tools.ts`, each with a Zod schema, each backed by a
real Prisma query. This is what "AI proposes" means concretely: the model
can *read* real data and *propose* a discount/campaign, but the actual
discount math, campaign persistence, and money movement always run through
plain deterministic code afterward.

If `GROQ_API_KEY` is not set, `runRuleBasedFallback` / the template
reasoning path in `buyerAgent.ts` still call the **same real tools** based on
simple keyword matching. This means the whole product is a genuine working
demo — not a mockup — even with zero external API keys configured. This is a
deliberate, documented trade-off, not a hidden shortcut.

## 4. Lightweight RAG (documented simplification)

The brief describes Postgres + `pgvector` for retrieval over
`KnowledgeDocument` rows (return policy, shipping policy, FAQ, etc).

Merqora ships the `KnowledgeDocument` model and seeds real policy documents,
but retrieval is implemented as **simple keyword/substring matching** rather
than vector similarity search, to avoid requiring a `pgvector` extension
install as a hard prerequisite for judges/reviewers running the project
locally.

**To upgrade to real vector search:**
1. Enable the `pgvector` extension on your Postgres instance (Neon supports
   this natively — see their pgvector docs).
2. Add a `vector` column to `KnowledgeDocument` (e.g. via a raw migration:
   `ALTER TABLE "KnowledgeDocument" ADD COLUMN embedding vector(1536);`).
3. Generate embeddings for each document (e.g. via an embeddings API) on
   create/update.
4. Replace the keyword filter in the retrieval helper with a `pgvector`
   cosine-distance query (`ORDER BY embedding <=> $1 LIMIT 5`), executed via
   `prisma.$queryRaw`.

This keeps the abstraction clean — the rest of the app only depends on "give
me the most relevant knowledge documents for this query," not on how that
lookup is implemented.

## 5. Idempotency

Every commerce-mutating endpoint that can plausibly be retried
(`POST /api/checkout/create`, `POST /api/payment/create`) requires an
`Idempotency-Key` header. The key is stored as a `@unique` column on `Order`
and `Payment` respectively. If a request arrives with a key that's already
been used, the **existing** record is returned instead of creating a new one.
See `src/lib/idempotency.ts` and the "duplicate-request" scenario in Failure
Lab for a live demonstration.

## 6. Payment verification — never trust the frontend

`POST /api/payment/verify` recomputes the Razorpay HMAC signature
server-side (`razorpayOrderId|razorpayPaymentId` signed with
`RAZORPAY_KEY_SECRET`) and only marks the order `PAID` if it matches. The
Razorpay webhook (`POST /api/webhooks/razorpay`) independently re-verifies
using `RAZORPAY_WEBHOOK_SECRET` against the **raw** request body (mounted
with `express.raw()`, not `express.json()`, specifically so signature
verification isn't broken by re-serialization). Both paths are idempotent —
if the webhook arrives after the synchronous verify call already marked the
order `PAID`, it just re-confirms rather than double-processing.

## 7. Razorpay adapter pattern

```
src/lib/razorpay.ts
  RazorpayClient            — interface: createOrder / verifyPaymentSignature / verifyWebhookSignature
  RazorpayProductionAdapter — wraps the real `razorpay` npm SDK
  RazorpayMockAdapter       — local-dev substitute, used automatically when
                              RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET are absent
```

`getRazorpayClient()` picks the adapter based on environment variables. The
mock adapter uses the **exact same HMAC verification scheme** as production
(just with a local mock secret), so the verification code path is identical
in both modes — nothing about "payment success" is hardcoded. The frontend
is told which mode is active (`GET /api/payment/config`) and displays a
clear "test/mock" indicator so nobody mistakes it for a real payment.

## 8. Why AI is used, and why it isn't

| Used for AI | Never touched by AI |
|---|---|
| Intent detection ("running shoes under ₹5000") | Payment amounts |
| Natural-language analytics ("why did revenue drop?") | Discount limits |
| Campaign / upsell suggestions with explanations | Inventory validation |
| Customer-facing shopping assistance | Order state transitions |
| | Authentication / authorization / RBAC |
| | Idempotency |
| | Payment / webhook signature verification |

## 9. Monorepo layout

```
merqora/
├── apps/
│   ├── api/     — Express + TypeScript + Prisma + PostgreSQL
│   └── web/     — React + Vite + TypeScript + Tailwind
├── docs/
├── docker-compose.yml   — local Postgres only
└── .env.example
```

`packages/shared` and `packages/config` from the original brief were folded
into `apps/api` and `apps/web` directly — for a project this size, a shared
package adds build-tooling overhead (extra `tsconfig` project references,
workspace symlinks) without a real payoff, since there are currently no
types genuinely shared byte-for-byte between the two apps. If the project
grows a second frontend or a worker process, extracting `packages/shared`
for DTOs at that point is straightforward.
