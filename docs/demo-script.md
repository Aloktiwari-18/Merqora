# Merqora — 5-Minute Demo Script

**Goal:** show a judge the full loop — AI proposes, policy decides, human
approves, code executes payment, everything is audited — in under 5 minutes.

## 0. Setup (before the room)
- Backend + frontend running (`npm run dev`), seeded (`npm run db:seed`).
- Log in with the demo account (Login page → "Use demo merchant account").

## 1. Landing page (30s)
Show `/` — the pitch: "AI agents that discover revenue opportunities and
safely execute commerce." Point at the "AI proposes → Policy decides →
Approval → Payment → Audit" strip.

## 2. Dashboard (30s)
`/dashboard` — all-real seeded numbers: revenue, abandoned cart value,
AI Revenue Opportunity card. Say: "every number here is computed from the
database live, nothing is hardcoded."

## 3. Nova, the Revenue Agent (60s)
`/ai-agent` — ask: **"Suggest ways to increase weekend revenue."**
Point out the 🔧 tool-call badges under the response — Nova is calling real
backend tools (`get_sales_trends`, `get_abandoned_carts`), not inventing
numbers. Then ask it to propose a campaign, or head to Campaigns directly.

## 4. Campaigns — policy + approval (45s)
`/campaigns` → **Propose Campaign** → fill in a discount above the policy's
₹500 limit → submit → show it gets **blocked by the policy engine**, not by
the AI second-guessing itself. Propose again within the limit → shows up as
`PROPOSED` → click **Approve**. Mention: "a deterministic policy engine
decided this, and a human approved it — the model never touched the
discount limit."

## 5. Sable, the AI Buyer + real Razorpay checkout (90s)
`/agent-commerce` — type **"I need running shoes under ₹5000."** Sable
searches the real catalog and explains its reasoning. **Add to cart** →
show the upsell card ("customers who buy this also buy running socks").
**Proceed to Checkout** → Razorpay Test Mode checkout opens → pay with the
test card `4111 1111 1111 1111` → order confirms. Say: "the frontend never
tells the backend 'payment succeeded' — the backend independently verifies
the HMAC signature before marking this order paid."

## 6. Failure Lab (45s)
`/failure-lab` → run **Payment failure** and **Duplicate payment request**
live. Show the step-by-step trace: input → system behavior → recovery →
final state → audit event. Say: "this isn't a canned animation — it's
hitting the real database and the real policy/idempotency code."

## 7. Audit Log (20s)
`/audit-log` — filter by `PAYMENT` or `FAILURE` — show the events from
everything you just did are all there, human-readable, timestamped.

## Closing line
"AI proposes. Policy decides. Humans approve sensitive actions. Code
executes money movement. Audit records everything. That's Merqora."
