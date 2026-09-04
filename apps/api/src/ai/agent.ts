/**
 * Revenue Agent ("Nova") tool-calling loop.
 *
 * Uses Groq's free-tier, OpenAI-compatible chat completions API
 * (https://console.groq.com) instead of a paid provider. Groq serves open
 * models (Llama 3.x, etc.) with genuine function/tool calling support at no
 * cost for reasonable usage, which keeps this project runnable without a
 * paid API key while still demonstrating a real tool-calling agent loop.
 *
 * If GROQ_API_KEY is configured, this drives a real tool-use loop: the
 * model reads the merchant's question, calls one or more of the tools in
 * ai/tools.ts (real DB reads only), and produces a final natural language
 * answer grounded in what the tools returned.
 *
 * If no API key is configured, `runRuleBasedFallback` still calls the same
 * real tools directly based on simple intent keyword matching, so the demo
 * remains fully functional (not a UI mockup) even without an LLM key. Every
 * run — AI-driven or fallback — is persisted as an AgentRun with
 * AgentAction rows for full auditability either way.
 */

import Groq from "groq-sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from "groq-sdk/resources/chat/completions";
import { prisma } from "../lib/prisma";
import { callTool, type ToolName } from "./tools";
import { logger } from "../lib/logger";

const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_revenue_summary",
      description: "Get total revenue, order count, average order value, failed payments and abandoned carts for a recent period.",
      parameters: { type: "object", properties: { days: { type: "number", description: "Lookback window in days, default 30" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_trends",
      description: "Get a daily revenue series and revenue broken down by day-of-week for a recent period.",
      parameters: { type: "object", properties: { days: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_products",
      description: "Get the best-selling products by units sold.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_segments",
      description: "Get customer counts and total spend grouped by customer segment.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_abandoned_carts",
      description: "Get abandoned carts, optionally filtered by a minimum cart value in paise (100 paise = ₹1).",
      parameters: { type: "object", properties: { minValueInPaise: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_failed_payments",
      description: "Get failed payment attempts in a recent period.",
      parameters: { type: "object", properties: { days: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search the product catalog by keyword, category, and/or price range (amounts in paise).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string" },
          minPriceInPaise: { type: "number" },
          maxPriceInPaise: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Get full details for a single product by id.",
      parameters: { type: "object", properties: { productId: { type: "string" } }, required: ["productId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_inventory",
      description: "Check current inventory for a product by id.",
      parameters: { type: "object", properties: { productId: { type: "string" } }, required: ["productId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_discount",
      description: "Check a proposed discount (in paise) against merchant policy before recommending it. Does not apply the discount.",
      parameters: {
        type: "object",
        properties: { cartValueInPaise: { type: "number" }, proposedDiscountInPaise: { type: "number" } },
        required: ["cartValueInPaise", "proposedDiscountInPaise"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_merchant_policy",
      description: "Get the merchant's current money-action policy limits.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_campaign_proposal",
      description:
        "Draft a campaign proposal (does not execute it) targeting abandoned carts or another goal, evaluated against merchant policy.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          goal: { type: "string" },
          offerDescription: { type: "string" },
          discountInPaise: { type: "number" },
        },
        required: ["title", "goal", "offerDescription", "discountInPaise"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are Nova, the Revenue Agent inside Merqora, an AI-native commerce platform for merchants.
You help merchants understand their store's performance and find revenue opportunities.

Rules you must always follow:
- You may ONLY use the numbers returned by tool calls. Never invent revenue, customer, or inventory figures.
- All monetary amounts from tools are in paise (1/100 of a rupee). Convert to ₹ for the merchant in your final answer.
- You never execute a discount, payment, refund, or campaign yourself — you may only PROPOSE one via create_campaign_proposal or calculate_discount. A separate deterministic policy engine and, where required, human approval, decide whether it actually happens.
- Keep answers concise, concrete, and grounded in the tool results. Reference actual numbers.
- When you propose a campaign or discount, always mention whether policy evaluation allowed it and whether approval is required.`;

export interface AgentRunResult {
  agentRunId: string;
  response: string;
  actions: { toolName: string; input: unknown; output: unknown }[];
  modelUsed: string;
}

export async function runRevenueAgent(merchantId: string, userMessage: string): Promise<AgentRunResult> {
  const agentRun = await prisma.agentRun.create({
    data: { merchantId, agentType: "revenue_agent", userMessage, status: "RUNNING" },
  });

  const apiKey = process.env.GROQ_API_KEY;
  try {
    const result = apiKey
      ? await runGroqLoop(merchantId, agentRun.id, userMessage, apiKey)
      : await runRuleBasedFallback(merchantId, agentRun.id, userMessage);

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "COMPLETED",
        finalResponse: result.response,
        modelUsed: result.modelUsed,
        completedAt: new Date(),
      },
    });
    return { agentRunId: agentRun.id, ...result };
  } catch (err) {
    logger.error("agent_run_failed", { agentRunId: agentRun.id, error: err instanceof Error ? err.message : String(err) });
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "FAILED", finalResponse: "The agent ran into an error and could not complete this request.", completedAt: new Date() },
    });
    return {
      agentRunId: agentRun.id,
      response: "Sorry — I ran into an error while analyzing your store data. Please try again.",
      actions: [],
      modelUsed: "none",
    };
  }
}

async function runGroqLoop(merchantId: string, agentRunId: string, userMessage: string, apiKey: string) {
  const client = new Groq({ apiKey });
  const model = process.env.AI_MODEL || "llama-3.3-70b-versatile";
  const actions: { toolName: string; input: unknown; output: unknown }[] = [];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
  let finalText = "";

  for (let turn = 0; turn < 6; turn++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      max_tokens: 1200,
    });

    const choice = completion.choices[0];
    const message = choice.message;
    finalText = message.content?.trim() || finalText;

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) break;

    messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name as ToolName;
      let parsedArgs: object = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        parsedArgs = {};
      }

      let output: unknown;
      try {
        output = await callTool(toolName, { merchantId, ...parsedArgs });
      } catch (err) {
        output = { error: err instanceof Error ? err.message : "Tool execution failed" };
      }
      actions.push({ toolName, input: parsedArgs, output });
      await prisma.agentAction.create({
        data: {
          agentRunId,
          actionType: "TOOL_CALL",
          toolName,
          input: parsedArgs as any,
          output: output as any,
          finalStatus: "SUCCESS",
        },
      });

      const toolResultMessage: ChatCompletionToolMessageParam = {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(output),
      };
      messages.push(toolResultMessage);
    }
  }

  return { response: finalText || "I wasn't able to generate a response. Please rephrase your question.", actions, modelUsed: model };
}

/**
 * Deterministic fallback: real tool calls driven by simple keyword-matched
 * intent, used when no GROQ_API_KEY is configured. This guarantees the
 * product is a genuine working demo (real DB-backed answers) even with zero
 * external API keys — it is intentionally simple and documented as such.
 */
async function runRuleBasedFallback(merchantId: string, agentRunId: string, userMessage: string) {
  const msg = userMessage.toLowerCase();
  const actions: { toolName: string; input: unknown; output: unknown }[] = [];

  async function run<T extends ToolName>(name: T, input: Record<string, unknown> = {}) {
    const output = await callTool(name, { merchantId, ...input });
    actions.push({ toolName: name, input, output });
    await prisma.agentAction.create({
      data: { agentRunId, actionType: "TOOL_CALL", toolName: name, input: input as any, output: output as any, finalStatus: "SUCCESS" },
    });
    return output as any;
  }

  let response: string;

  if (msg.includes("revenue") && (msg.includes("why") || msg.includes("decrease") || msg.includes("down"))) {
    const summary = await run("get_revenue_summary", { days: 7 });
    const trends = await run("get_sales_trends", { days: 30 });
    response = `Over the last 7 days your store made ₹${(summary.revenueInPaise / 100).toLocaleString("en-IN")} across ${summary.ordersCount} paid orders (avg order value ₹${(summary.averageOrderValueInPaise / 100).toLocaleString("en-IN")}). In that window there were ${summary.failedPaymentsCount} failed payments and ${summary.abandonedCartsCount} abandoned carts — both reduce realized revenue versus what was in carts. Looking at the day-of-week breakdown from the last 30 days, revenue is unevenly distributed across days: ${Object.entries(trends.revenueByDayOfWeek).map(([d, v]) => `${d} ₹${((v as number) / 100).toLocaleString("en-IN")}`).join(", ")}. Recovering abandoned carts and reducing failed payments are the two most direct levers.`;
  } else if (msg.includes("abandoned") && msg.includes("cart")) {
    const minMatch = msg.match(/(\d[\d,]*)/);
    const minValueInPaise = minMatch ? parseInt(minMatch[1].replace(/,/g, ""), 10) * 100 : 0;
    const carts = await run("get_abandoned_carts", { minValueInPaise });
    response = `Found ${carts.count} abandoned carts${minValueInPaise ? ` worth more than ₹${(minValueInPaise / 100).toLocaleString("en-IN")}` : ""}, totaling ₹${(carts.totalValueInPaise / 100).toLocaleString("en-IN")} in unrecovered cart value.`;
  } else if (msg.includes("promote") || msg.includes("top product") || msg.includes("which product")) {
    const top = await run("get_top_products", { limit: 5 });
    response = `Your top-selling products by units are: ${top.map((p: any, i: number) => `${i + 1}. ${p.name} (${p.unitsSold} units, ${p.currentInventory} left in stock)`).join("; ")}. These are strong candidates to feature in promotions since demand is already proven.`;
  } else if (msg.includes("customer") && (msg.includes("segment") || msg.includes("likely") || msg.includes("running") || msg.includes("find"))) {
    const segments = await run("get_customer_segments");
    response = `Customer segments on file: ${segments.map((s: any) => `${s.segment} (${s.customerCount} customers, ₹${(s.totalSpentInPaise / 100).toLocaleString("en-IN")} total spend)`).join("; ")}. For product-specific targeting, use the AI Buyer catalog search alongside these segments.`;
  } else if (msg.includes("weekend")) {
    const trends = await run("get_sales_trends", { days: 60 });
    const carts = await run("get_abandoned_carts", { minValueInPaise: 0 });
    response = `Based on the last 60 days, revenue by day of week is: ${Object.entries(trends.revenueByDayOfWeek).map(([d, v]) => `${d} ₹${((v as number) / 100).toLocaleString("en-IN")}`).join(", ")}. There are also ${carts.count} abandoned carts worth ₹${(carts.totalValueInPaise / 100).toLocaleString("en-IN")} that could be targeted with a weekend recovery campaign — ask me to "create a campaign to recover abandoned carts" and I'll draft a policy-checked proposal for your approval.`;
  } else if (msg.includes("campaign") || (msg.includes("increase") && msg.includes("revenue"))) {
    const proposal = await run("create_campaign_proposal", {
      title: "Weekend Abandoned Cart Recovery",
      goal: "Increase weekend revenue by recovering abandoned carts",
      offerDescription: "₹200 discount for customers who complete a checkout on an abandoned cart",
      discountInPaise: 20000,
    });
    response = `Draft campaign — "${proposal.title}": target ${proposal.audienceSize} customers with abandoned carts, offering ₹${(proposal.discountInPaise / 100).toLocaleString("en-IN")} off. Estimated recoverable revenue: ₹${(proposal.estimatedRecoverableInPaise / 100).toLocaleString("en-IN")}. Risk: ${proposal.riskLevel}. Policy evaluation: ${proposal.policyDecision} (${proposal.policyReason}). ${proposal.requiresApproval ? "This requires your approval before it runs." : "This can run automatically under current policy."} Open the Campaigns page to approve, reject, or edit it.`;
  } else {
    const summary = await run("get_revenue_summary", { days: 30 });
    response = `Here's a quick snapshot: ₹${(summary.revenueInPaise / 100).toLocaleString("en-IN")} revenue and ${summary.ordersCount} paid orders in the last 30 days, ${summary.abandonedCartsCount} abandoned carts, ${summary.failedPaymentsCount} failed payments. Ask me things like "why did revenue decrease this week", "find abandoned carts worth more than ₹3000", or "suggest ways to increase weekend revenue" for a deeper answer.`;
  }

  return { response, actions, modelUsed: "rule-based-fallback (no GROQ_API_KEY configured)" };
}
