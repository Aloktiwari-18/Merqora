# Merqora — Deployment Guide

Production architecture:

```
User → Vercel (apps/web)  →  Render (apps/api)  →  Neon PostgreSQL
                                      │
                                      ├──▶ Razorpay Test API ──▶ Webhook ──▶ Render API
                                      └──▶ Groq API (Nova / Sable)
```

## 1. Provision Neon PostgreSQL

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the connection string it gives you (includes `?sslmode=require`).
3. This is your production `DATABASE_URL`.

## 2. Deploy the backend to Render

1. Push this repo to GitHub (see §5 below if you haven't yet).
2. In Render, **New → Web Service**, connect the repo.
3. Root directory: `apps/api`
4. Build command: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
5. Start command: `npm start`
6. Environment variables (Render → Environment tab):
   ```
   DATABASE_URL=<your Neon connection string>
   JWT_SECRET=<a long random string>
   PORT=4000
   CLIENT_URL=<your Vercel URL, e.g. https://merqora.vercel.app>
   RAZORPAY_KEY_ID=<your Razorpay test key id>
   RAZORPAY_KEY_SECRET=<your Razorpay test key secret>
   RAZORPAY_WEBHOOK_SECRET=<your webhook secret>
   GROQ_API_KEY=<optional>
   AI_MODEL=llama-3.3-70b-versatile
   ```
7. Deploy. Once live, run the seed script once against production (Render
   → Shell tab, or locally with `DATABASE_URL` pointed at Neon):
   ```
   npm run db:seed --workspace=apps/api
   ```

## 3. Deploy the frontend to Vercel

1. In Vercel, **New Project**, import the same repo.
2. Root directory: `apps/web`
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Environment variable:
   ```
   VITE_API_URL=<your Render backend URL, e.g. https://merqora-api.onrender.com>
   ```
7. Deploy.

## 4. Wire up the Razorpay webhook for production

Once the Render backend is live, add its webhook URL in the Razorpay
dashboard (Test Mode): `https://<your-render-service>.onrender.com/api/webhooks/razorpay`.
See `docs/razorpay.md` §5 for the full walkthrough.

## 5. Creating the GitHub repository

```bash
cd merqora
git init
git add .
git commit -m "Initial commit — Merqora"
git branch -M main
git remote add origin https://github.com/<your-username>/merqora.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `dist`, and `.env` files — double-check
`git status` before your first push to make sure no `.env` file is staged.

## 6. Local development (recap)

```bash
docker compose up -d              # starts local Postgres
cp .env.example apps/api/.env     # fill in values
cp apps/web/.env.example apps/web/.env
npm install
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api
npm run dev
```

Frontend: http://localhost:5173 · Backend: http://localhost:4000

## 7. Production environment variable checklist

- [ ] `DATABASE_URL` — Neon connection string
- [ ] `JWT_SECRET` — long random string, different from any dev value
- [ ] `CLIENT_URL` — exact Vercel URL (used for CORS)
- [ ] `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` — Test Mode keys
- [ ] `GROQ_API_KEY` — optional; app runs on rule-based fallback without it
- [ ] `VITE_API_URL` (frontend) — exact Render backend URL
