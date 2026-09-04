import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";

import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { productsRouter } from "./routes/products";
import { customersRouter } from "./routes/customers";
import { ordersRouter } from "./routes/orders";
import { agentRouter } from "./routes/agent";
import { agentCatalogRouter } from "./routes/agentCatalog";
import { buyerRouter } from "./routes/buyer";
import { cartRouter } from "./routes/cart";
import { checkoutRouter } from "./routes/checkout";
import { paymentRouter } from "./routes/payment";
import { webhooksRouter } from "./routes/webhooks";
import { auditRouter } from "./routes/audit";
import { policiesRouter } from "./routes/policies";
import { campaignsRouter } from "./routes/campaigns";
import { failureLabRouter } from "./routes/failureLab";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { logger } from "./lib/logger";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use((req, _res, next) => {
  (req as any).requestId = req.headers["x-request-id"] || randomUUID();
  next();
});

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });
app.use(apiLimiter);

// The Razorpay webhook route needs the RAW request body to verify the HMAC
// signature, so it is mounted BEFORE the JSON body parser and given its own
// raw body parser instead.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhooksRouter);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/products", productsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/orders", ordersRouter);
// IMPORTANT: agentCatalogRouter (public, unauthenticated agent-readable
// catalog: /catalog, /products, /products/:id, /products/search,
// /products/:id/inventory) is mounted BEFORE agentRouter (which requires
// auth for /chat and /runs) so that public catalog requests never hit the
// requireAuth middleware. Express falls through to agentRouter only for
// paths agentCatalogRouter doesn't define.
app.use("/api/agent", agentCatalogRouter);
app.use("/api/agent", agentRouter);
app.use("/api/buyer", buyerRouter);
app.use("/api/cart", cartRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/audit", auditRouter);
app.use("/api/policies", policiesRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/failure-lab", failureLabRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  logger.info("server_started", { port: PORT, env: process.env.NODE_ENV || "development" });
});
