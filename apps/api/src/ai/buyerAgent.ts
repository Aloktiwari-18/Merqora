/**
 * "Sable" — the customer-facing AI Buyer assistant.
 *
 * Parses shopper intent (budget, category/keyword) and always searches the
 * real catalog via search_products (ai/tools.ts) — it never invents
 * products or prices. If GROQ_API_KEY is set, Groq's free-tier chat
 * completions API (Llama models) is used to write the natural-language
 * reasoning summary grounded in the actual search results; otherwise a
 * template-based summary is used. Either way the product list shown to the
 * shopper always comes straight from the DB.
 */

import Groq from "groq-sdk";
import { prisma } from "../lib/prisma";
import { callTool } from "./tools";
import { logger } from "../lib/logger";

export interface BuyerAgentResult {
  agentRunId: string;
  reasoning: string;
  products: unknown[];
}

function parseIntent(message: string) {
  const budgetMatch = message.match(/(?:under|below|less than|within)\s*₹?\s*(\d[\d,]*)/i) || message.match(/₹\s*(\d[\d,]*)/);
  const maxPriceInPaise = budgetMatch ? parseInt(budgetMatch[1].replace(/,/g, ""), 10) * 100 : undefined;

  const categories = ["electronics", "fashion", "fitness", "home", "accessories"];
  const category = categories.find((c) => message.toLowerCase().includes(c));

  // Use remaining free text (minus budget phrase) as a keyword query.
  const query = message
    .replace(/(?:under|below|less than|within)\s*₹?\s*\d[\d,]*/gi, "")
    .replace(/₹\s*\d[\d,]*/g, "")
    .replace(/\b(i need|i want|looking for|find me|show me|please)\b/gi, "")
    .trim();

  return { maxPriceInPaise, category, query: query || undefined };
}

export async function runAiBuyer(merchantId: string, userMessage: string): Promise<BuyerAgentResult> {
  const agentRun = await prisma.agentRun.create({
    data: { merchantId, agentType: "ai_buyer", userMessage, status: "RUNNING" },
  });

  const intent = parseIntent(userMessage);
  const products = (await callTool("search_products", { merchantId, ...intent })) as any[];

  await prisma.agentAction.create({
    data: {
      agentRunId: agentRun.id,
      actionType: "TOOL_CALL",
      toolName: "search_products",
      input: intent as any,
      output: products as any,
      finalStatus: "SUCCESS",
    },
  });

  let reasoning: string;
  const apiKey = process.env.GROQ_API_KEY;
  if (apiKey && products.length > 0) {
    try {
      reasoning = await summarizeWithGroq(apiKey, userMessage, intent, products);
    } catch (err) {
      logger.warn("ai_buyer_groq_summary_failed", { error: err instanceof Error ? err.message : String(err) });
      reasoning = templateReasoning(intent, products);
    }
  } else {
    reasoning = templateReasoning(intent, products);
  }

  await prisma.agentRun.update({
    where: { id: agentRun.id },
    data: { status: "COMPLETED", finalResponse: reasoning, modelUsed: apiKey ? process.env.AI_MODEL || "llama-3.3-70b-versatile" : "template", completedAt: new Date() },
  });

  return { agentRunId: agentRun.id, reasoning, products };
}

function templateReasoning(intent: ReturnType<typeof parseIntent>, products: any[]) {
  if (products.length === 0) {
    return `I couldn't find products matching your request${intent.maxPriceInPaise ? ` under ₹${(intent.maxPriceInPaise / 100).toLocaleString("en-IN")}` : ""}. Try a different budget or category.`;
  }
  const parts: string[] = [];
  if (intent.maxPriceInPaise) parts.push(`under your ₹${(intent.maxPriceInPaise / 100).toLocaleString("en-IN")} budget`);
  if (intent.category) parts.push(`in ${intent.category}`);
  return `I prioritized ${products.length} products ${parts.join(" and ") || "matching your request"} that are currently in stock, sorted by price.`;
}

async function summarizeWithGroq(apiKey: string, userMessage: string, intent: unknown, products: any[]) {
  const client = new Groq({ apiKey });
  const model = process.env.AI_MODEL || "llama-3.3-70b-versatile";
  const completion = await client.chat.completions.create({
    model,
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content:
          "You are Sable, a shopping assistant. Given a shopper's request and a list of REAL product search results, write a single short (1-3 sentence) reasoning summary explaining your recommendation. Never mention products not in the list. Never invent prices or stock levels.",
      },
      {
        role: "user",
        content: `Shopper request: "${userMessage}"\nParsed intent: ${JSON.stringify(intent)}\nSearch results: ${JSON.stringify(
          products.map((p) => ({ name: p.name, priceInPaise: p.priceInPaise, category: p.category, availability: p.availability }))
        )}`,
      },
    ],
  });
  const text = completion.choices[0]?.message?.content;
  return text?.trim() || templateReasoning(intent as any, products);
}
