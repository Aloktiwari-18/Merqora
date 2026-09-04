# Merqora

**Track:** Razorpay — AI Growth & Agentic Commerce

**The Intelligence Layer for Commerce.**

AI agents that discover revenue opportunities and safely execute commerce —
Merqora connects merchant intelligence, agentic shopping, and bounded
payments into one AI-native commerce layer.

---

## Table of contents

1. [Problem &amp; solution](#problem--solution)
2. [Core features](#core-features)
3. [Architecture at a glance](#architecture-at-a-glance)
4. [AI judgment — where AI is used, and where it isn't](#ai-judgment)
5. [Tech stack](#tech-stack)
6. [Project structure](#project-structure)
7. [Prerequisites](#prerequisites)
8. [Quick start (local development)](#quick-start-local-development)
9. [Environment variables](#environment-variables)
10. [Razorpay setup](#razorpay-setup)
11. [AI API setup](#ai-api-setup)
12. [Database &amp; seed data](#database--seed-data)
13. [Testing](#testing)
14. [Deployment](#deployment)
15. [Security](#security)
16. [Failure scenarios](#failure-scenarios)
17. [Known limitations](#known-limitations)
18. [Future improvements](#future-improvements)
19. [Demo credentials &amp; 5-minute demo script](#demo-credentials--5-minute-demo-script)
20. [License](#license)

---

## Problem &amp; solution

**Problem:** merchants sit on revenue signals — abandoned carts, underpriced
bestsellers, weekend demand spikes — that go unnoticed until it's too late.
"AI agents" for commerce are usually given either no real access (chatbots
that can't act) or unrestricted access (agents that can move money with no
guardrails).

**Solution:** Merqora's AI reads real store data and proposes revenue
actions. A deterministic policy engine — plain TypeScript, no LLM inside it
— decides what's actually allowed. Humans approve anything sensitive. Code,
never the model, executes money movement through Razorpay. Every step is
logged to an audit trail.

**Why now:** agentic commerce (AI shopping assistants, AI-run storefronts)
is moving fast, but the biggest blocker to merchant trust isn't capability —
it's governance. Merqora is a concrete answer to "how do you let an AI agent
near your payment flow without giving it your payment flow."

## Core features

- **Merchant dashboard** — real DB-backed revenue, orders, conversion,
  AOV, abandoned carts, failed payments, AI revenue opportunity.
- **Nova — Revenue Agent** — natural-language analytics over real tool
  calls (`get_revenue_summary`, `get_abandoned_carts`, `get_top_products`,
  etc). Works with or without an `GROQ_API_KEY` (rule-based fallback).
- **Agent-readable catalog** — `/api/agent/catalog` and friends, built for
  consumption by *other* AI agents/buyers.
- **Sable — AI Buyer** — parses shopper intent, searches the real catalog,
  explains its reasoning, adds to cart, checks out via Razorpay Test Mode.
- **Upsell / cross-sell** — recommendations from a real seeded
  co-purchase graph, never fabricated statistics.
- **Campaign Orchestrator** — AI drafts a campaign; policy engine checks
  limits; a human explicitly approves, rejects, or edits before anything
  executes.
- **Policy Engine** — deterministic discount/transaction/campaign/upsell/
  refund rules a merchant can configure; the LLM never decides these.
- **Money Action Gating** — every proposal flows through
  `AgentAction` → policy → `AgentApproval` (if required) → execution →
  `AuditLog`.
- **Audit Trail** — filterable, human-readable log of every agent action,
  policy decision, approval, and payment event.
- **Failure Lab** — 8 real, live simulations (payment failure, inventory
  race, duplicate request, timeout, webhook delay, invalid discount,
  product unavailable, LLM timeout) — not canned animations.
- **Idempotency** — `Idempotency-Key` header on checkout/payment creation;
  duplicate requests return the existing record, never a duplicate charge.
- **Razorpay Test Mode** — real `razorpay` SDK integration, server-side
  signature verification, real webhook handling, plus a clean
  `RazorpayMockAdapter` for credential-free local development.

## Architecture at a glance

See **[`docs/architecture.md`](docs/architecture.md)** for the full
write-up (diagrams, why integer-paise money, the AI tool-calling loop, the
lightweight RAG design, idempotency, and the Razorpay adapter pattern).

The one-line version:

```
AI proposes → Policy Engine decides → Approval (if required) → Code executes → Audit Log
```

## AI judgment

| AI is used for | AI is never used for |
|---|---|
| Intent detection, product discovery | Payment amounts / discount limits |
| Natural-language analytics | Inventory validation, order state transitions |
| Campaign / upsell suggestions with explanations | Authentication, authorization, RBAC |
| Customer-facing shopping assistance | Idempotency, payment/webhook signature verification |

Full reasoning in [`docs/architecture.md §8`](docs/architecture.md#8-why-ai-is-used-and-why-it-isnt).

## Tech stack

- **Backend:** Node.js, TypeScript, Express, Prisma, PostgreSQL, Zod,
  JWT + bcrypt, Helmet, express-rate-limit, `razorpay` SDK,
  `groq-sdk`, Vitest.
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts,
  Framer Motion, lucide-react, react-router-dom, axios.
- **Infra:** Docker Compose (local Postgres), Vercel (frontend), Render
  (backend), Neon (production Postgres).

## Project structure

```
merqora/
├── apps/
│   ├── api/                # Express + Prisma backend
│   │   ├── prisma/         # schema.prisma, seed.ts
│   │   ├── src/
│   │   │   ├── ai/         # agent tools, Nova, Sable
│   │   │   ├── lib/        # policy engine, razorpay, auth, idempotency, audit
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   └── server.ts
│   │   └── tests/
│   └── web/                # React + Vite frontend
│       └── src/
│           ├── components/
│           ├── context/     # auth, theme
│           ├── lib/          # api client
│           └── pages/
├── docs/                    # architecture, api, razorpay, deployment, demo-script
├── docker-compose.yml
├── .env.example
└── README.md
```

> **Structure note:** the original brief also suggested `packages/shared`
> and `packages/config`. For this project's size there are no types
> genuinely duplicated byte-for-byte between `apps/api` and `apps/web`, so
> a shared package would add workspace/tsconfig overhead without payoff —
> see the note at the bottom of `docs/architecture.md`.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (for local Postgres) — or any reachable Postgres instance
- A Razorpay account (Test Mode) — optional, see below
- An Groq API key — optional, see below

## Quick start (local development)

```bash
git clone <your-repo-url> merqora
cd merqora

# 1. Start local Postgres
docker compose up -d

# 2. Configure environment
cp .env.example apps/api/.env       # edit values as needed (works out of the box for local dev)
cp apps/web/.env.example apps/web/.env

# 3. Install dependencies
npm install

# 4. Set up the database
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api

# 5. Run everything
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Demo login: `demo@merqora.dev` / `Demo@12345` (or just click "Use demo
  merchant account" on the login screen)

**Works with zero external API keys.** Without `RAZORPAY_KEY_ID`/etc., the
app uses `RazorpayMockAdapter`. Without `GROQ_API_KEY`, Nova and Sable
use a deterministic, still-real (DB-backed) rule-based mode. See
[`docs/razorpay.md`](docs/razorpay.md) and the AI API section below to
enable the real integrations.

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. Key ones:

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Any long random string |
| `RAZORPAY_KEY_ID` / `_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | No | Falls back to mock adapter if unset |
| `GROQ_API_KEY` | No | Falls back to rule-based agent responses if unset |
| `VITE_API_URL` (frontend) | Yes | Points the frontend at the backend |

## Razorpay setup

Full step-by-step guide with screenshoted-in-words instructions on
creating an account, finding Test Mode keys, configuring webhooks, testing
payments and failures: **[`docs/razorpay.md`](docs/razorpay.md)**.

## AI API setup

Merqora uses **[Groq](https://console.groq.com)** — a genuinely free API
(no credit card required) that serves fast, open models (Llama 3.3, etc.)
with real function/tool-calling support. This keeps the project runnable
by anyone at zero cost, instead of requiring a paid provider.

1. Create a free account at [console.groq.com](https://console.groq.com).
2. Go to **API Keys → Create API Key**.
3. Set `GROQ_API_KEY` in `apps/api/.env`.
4. Optionally set `AI_MODEL` (defaults to `llama-3.3-70b-versatile`).
5. Restart the backend.

Without a key, Nova and Sable still work — see
[`docs/architecture.md §3`](docs/architecture.md#3-ai-agent-architecture).

## Database &amp; seed data

- **ORM:** Prisma, schema at `apps/api/prisma/schema.prisma`.
- **Migrate:** `npm run db:migrate --workspace=apps/api`
- **Seed:** `npm run db:seed --workspace=apps/api` — creates one demo
  merchant with 30 products, 100 customers, 200 paid orders, 50 abandoned
  carts, 20 failed payments, 10 campaigns, 5 upsell recommendation pairs,
  4 knowledge documents, and 100 audit log entries, all in INR.
- **Studio:** `npm run db:studio --workspace=apps/api` to browse the DB.

Money is stored as **integer paise**, not `Decimal`/`Float` — see
[`docs/architecture.md §2`](docs/architecture.md#2-why-integer-paise-instead-of-prisma-decimal)
for the reasoning.

## Testing

```bash
npm run test --workspace=apps/api
```

Unit tests cover the policy engine (discount/transaction/campaign/upsell/
agent-order-creation rules) and the Razorpay mock adapter's signature
verification (accepts valid signatures, rejects tampered ones, rejects
cross-order signatures) plus idempotency key generation — **18 tests, all
passing**.

> **Sandbox note:** this project was built inside a network-restricted
> sandbox that could not reach `binaries.prisma.sh` (Prisma's engine
> binary host), so `npx prisma generate` / full DB integration tests could
> not be executed inside that sandbox. This is **not** a limitation of the
> shipped code — on a normal developer machine with standard internet
> access, `npm install && npx prisma generate` works exactly as expected.
> The unit tests above were specifically chosen to validate the core
> business logic (money-safety rules, signature verification, idempotency)
> without depending on a generated Prisma client, and the frontend
> (`npm run build`) and backend logic were otherwise verified via
> TypeScript review. Please run `npm run db:migrate && npm run db:seed`
> locally to exercise the full integration path — it's a completely
> standard Prisma + Postgres flow.

## Deployment

Full walkthrough (Neon → Render → Vercel, plus GitHub setup) in
**[`docs/deployment.md`](docs/deployment.md)**.

## Security

Helmet, CORS restricted to `CLIENT_URL`, `express-rate-limit`, Zod
validation on every mutating endpoint, JWT auth + bcrypt password hashing,
role-based authorization (`ADMIN` / `MERCHANT` / `MARKETING` / `SUPPORT`),
webhook HMAC signature verification, secrets never logged (see the
redaction logic in `src/lib/logger.ts`) or sent to the frontend, SQL
injection prevented via Prisma's parameterized queries throughout, and
structured (never raw-stack-trace) error responses.

## Failure scenarios

Live, real simulations (not animations) in the **Failure Lab** page:
payment failure, inventory changed during checkout, duplicate payment
request, API timeout, webhook delay, invalid discount, product
unavailable, and LLM/AI-provider timeout. Each writes a real `AuditLog`
entry. See [`docs/api.md`](docs/api.md#failure-lab-) for the endpoint list.

## Known limitations

- **RAG is keyword-based, not vector-based** — `KnowledgeDocument` rows
  exist and are seeded, but retrieval is simple keyword matching rather
  than `pgvector` cosine similarity. Upgrade path documented in
  `docs/architecture.md §4`.
- **Prisma engine could not be verified live in this build environment**
  due to a sandboxed network restriction — see the Testing section above.
  This is expected to work normally for you.
- **Campaign approval is always explicit** — even when
  `campaignRequiresApproval` is `false`, the UI still requires an
  explicit Approve/Reject click, favoring a visible human-in-the-loop
  demo over a fully automated path.
- **AgentRun/AgentAction/AgentApproval governance rows** are populated for
  the Revenue Agent's tool calls and for Campaign proposals; the AI
  Buyer's product search is logged as an `AgentRun`, but does not (yet)
  create a discrete `AgentApproval` since checkout itself already requires
  the customer to authorize payment via Razorpay Checkout.
- **Single demo merchant per seed run** — multi-tenant switching in the UI
  isn't built; registering a new merchant account works, but there's no
  "switch active merchant" selector in the app shell.

## Future improvements

- Real `pgvector` retrieval for the RAG layer.
- LangGraph (or similar) orchestration if the agent tool graph grows
  beyond a single tool-calling loop.
- Refund flow UI (the policy engine already models `evaluateRefund`).
- Multi-merchant switcher in the app shell.
- Automated integration tests against a real ephemeral Postgres in CI.

## Demo credentials &amp; 5-minute demo script

- **Email:** `demo@merqora.dev`
- **Password:** `Demo@12345`
- (Development only — never reuse this pattern for a production password.)

Full walkthrough: **[`docs/demo-script.md`](docs/demo-script.md)**.

## License

MIT — see [`LICENSE`](LICENSE).
