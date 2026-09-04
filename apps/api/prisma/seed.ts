/**
 * Seed script — generates a realistic demo merchant with products, customers,
 * orders, abandoned carts, failed payments, campaigns, recommendations, and
 * audit logs so the dashboard looks populated immediately. All numbers shown
 * anywhere in the UI are computed FROM this seeded data, never hardcoded.
 */
import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const CATEGORIES = ["Electronics", "Fashion", "Fitness", "Home", "Accessories"] as const;

const PRODUCT_TEMPLATES: { name: string; category: (typeof CATEGORIES)[number]; priceInPaise: number; useCases: string[] }[] = [
  { name: "AeroFlex Running Shoes", category: "Fitness", priceInPaise: 429900, useCases: ["running", "jogging", "marathon training"] },
  { name: "TrailBlaze Trail Runners", category: "Fitness", priceInPaise: 489900, useCases: ["running", "trail running"] },
  { name: "SprintLite Running Socks", category: "Fitness", priceInPaise: 39900, useCases: ["running", "everyday wear"] },
  { name: "HydroCarry Sports Water Bottle", category: "Fitness", priceInPaise: 59900, useCases: ["running", "gym", "cycling"] },
  { name: "SunGuard Sports Cap", category: "Fitness", priceInPaise: 79900, useCases: ["running", "outdoor sports"] },
  { name: "PowerFlex Resistance Bands Set", category: "Fitness", priceInPaise: 129900, useCases: ["home workout", "strength training"] },
  { name: "CoreFit Yoga Mat", category: "Fitness", priceInPaise: 149900, useCases: ["yoga", "home workout"] },
  { name: "PulseTrack Fitness Band", category: "Electronics", priceInPaise: 249900, useCases: ["fitness tracking", "running"] },
  { name: "SoundWave Pro Wireless Earbuds", category: "Electronics", priceInPaise: 349900, useCases: ["music", "calls", "workout"] },
  { name: "SoundWave Mini Bluetooth Speaker", category: "Electronics", priceInPaise: 229900, useCases: ["music", "travel"] },
  { name: "ChargeFast 20W Wall Charger", category: "Electronics", priceInPaise: 99900, useCases: ["charging", "travel"] },
  { name: "VoltPack 10000mAh Power Bank", category: "Electronics", priceInPaise: 179900, useCases: ["travel", "charging"] },
  { name: "ClearView Laptop Stand", category: "Electronics", priceInPaise: 189900, useCases: ["work from home", "ergonomics"] },
  { name: "TypeFlow Mechanical Keyboard", category: "Electronics", priceInPaise: 449900, useCases: ["work", "gaming"] },
  { name: "PixelClick Wireless Mouse", category: "Electronics", priceInPaise: 129900, useCases: ["work", "gaming"] },
  { name: "UrbanFit Denim Jacket", category: "Fashion", priceInPaise: 259900, useCases: ["casual wear", "layering"] },
  { name: "ClassicWeave Cotton Shirt", category: "Fashion", priceInPaise: 149900, useCases: ["office wear", "casual wear"] },
  { name: "FlexFit Joggers", category: "Fashion", priceInPaise: 169900, useCases: ["casual wear", "loungewear"] },
  { name: "StrideStep Canvas Sneakers", category: "Fashion", priceInPaise: 219900, useCases: ["casual wear", "everyday"] },
  { name: "WarmCore Wool Sweater", category: "Fashion", priceInPaise: 279900, useCases: ["winter wear"] },
  { name: "LeatherCraft Wallet", category: "Accessories", priceInPaise: 99900, useCases: ["everyday carry"] },
  { name: "TimeKeeper Analog Watch", category: "Accessories", priceInPaise: 349900, useCases: ["everyday wear", "formal wear"] },
  { name: "SunShield Polarized Sunglasses", category: "Accessories", priceInPaise: 149900, useCases: ["outdoor", "driving"] },
  { name: "CarryAll Laptop Backpack", category: "Accessories", priceInPaise: 249900, useCases: ["work", "travel", "commute"] },
  { name: "TravelLite Duffel Bag", category: "Accessories", priceInPaise: 189900, useCases: ["travel", "gym"] },
  { name: "BrewMaster Electric Kettle", category: "Home", priceInPaise: 189900, useCases: ["kitchen"] },
  { name: "AromaFresh Essential Oil Diffuser", category: "Home", priceInPaise: 129900, useCases: ["home decor", "relaxation"] },
  { name: "GlowLite LED Desk Lamp", category: "Home", priceInPaise: 99900, useCases: ["work from home", "study"] },
  { name: "SoftWeave Cotton Bedsheet Set", category: "Home", priceInPaise: 219900, useCases: ["bedroom"] },
  { name: "CrispAir Room Humidifier", category: "Home", priceInPaise: 259900, useCases: ["home comfort"] },
];

const CUSTOMER_SEGMENTS = ["running_enthusiast", "high_value", "at_risk", "new", "general"];

async function main() {
  console.log("Seeding Merqora demo data...");

  await prisma.auditLog.deleteMany();
  await prisma.agentApproval.deleteMany();
  await prisma.agentAction.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.campaignAudience.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.knowledgeDocument.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.merchantPolicy.deleteMany();
  await prisma.merchant.deleteMany();

  const merchant = await prisma.merchant.create({
    data: { name: "Urban Stride Co.", slug: "urban-stride-co", currency: "INR" },
  });

  await prisma.merchantPolicy.create({
    data: {
      merchantId: merchant.id,
      maximumDiscountInPaise: 50000, // ₹500
      maximumTransactionInPaise: 1000000, // ₹10,000
      automaticPayment: false,
      automaticRefund: false,
      campaignRequiresApproval: true,
      upsellAllowed: true,
      agentCanCreateOrder: true,
    },
  });

  const demoPasswordHash = await bcrypt.hash("Demo@12345", 10);
  await prisma.user.create({
    data: { email: "demo@merqora.dev", name: "Demo Merchant", passwordHash: demoPasswordHash, role: "ADMIN", merchantId: merchant.id },
  });
  await prisma.user.create({
    data: { email: "marketing@merqora.dev", name: "Priya Marketing", passwordHash: demoPasswordHash, role: "MARKETING", merchantId: merchant.id },
  });

  console.log("Creating products...");
  const products = [];
  for (const template of PRODUCT_TEMPLATES) {
    const product = await prisma.product.create({
      data: {
        merchantId: merchant.id,
        name: template.name,
        description: `${template.name} — a top pick in our ${template.category.toLowerCase()} range, built for everyday reliability.`,
        category: template.category,
        priceInPaise: template.priceInPaise,
        inventory: faker.number.int({ min: 3, max: 120 }),
        useCases: template.useCases,
        attributes: { brand: "Merqora Essentials", rating: faker.number.float({ min: 3.8, max: 5, fractionDigits: 1 }) },
      },
    });
    products.push(product);
  }

  // Deliberately push a couple of products into low-stock territory for the dashboard "priority actions" story.
  await prisma.product.update({ where: { id: products[0].id }, data: { inventory: 5 } });
  await prisma.product.update({ where: { id: products[7].id }, data: { inventory: 2 } });

  console.log("Creating recommendations (upsell graph)...");
  const shoes = products.find((p) => p.name.includes("AeroFlex Running Shoes"))!;
  const socks = products.find((p) => p.name.includes("SprintLite Running Socks"))!;
  const bottle = products.find((p) => p.name.includes("HydroCarry"))!;
  const cap = products.find((p) => p.name.includes("SunGuard"))!;
  const earbuds = products.find((p) => p.name.includes("SoundWave Pro"))!;
  const powerbank = products.find((p) => p.name.includes("VoltPack"))!;
  const jacket = products.find((p) => p.name.includes("UrbanFit Denim"))!;
  const backpack = products.find((p) => p.name.includes("CarryAll"))!;

  const recPairs: [any, any, number, string][] = [
    [shoes, socks, 0.82, "Customers purchasing this product frequently purchase running socks in the same order."],
    [shoes, bottle, 0.61, "Runners buying shoes often add a sports water bottle."],
    [shoes, cap, 0.44, "A sports cap is a common add-on for outdoor runners."],
    [earbuds, powerbank, 0.55, "Customers who buy wireless earbuds often add a power bank for travel."],
    [jacket, backpack, 0.38, "Shoppers building a casual outfit often add a laptop backpack."],
  ];
  for (const [source, target, score, reason] of recPairs) {
    await prisma.recommendation.create({
      data: {
        merchantId: merchant.id,
        sourceProductId: source.id,
        recommendedProductId: target.id,
        affinityScore: score,
        coPurchaseCount: Math.round(score * 200),
        reason,
      },
    });
  }

  console.log("Creating customers...");
  const customers = [];
  for (let i = 0; i < 100; i++) {
    const segment = faker.helpers.arrayElement(CUSTOMER_SEGMENTS);
    const customer = await prisma.customer.create({
      data: {
        merchantId: merchant.id,
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        phone: faker.phone.number(),
        segment,
      },
    });
    customers.push(customer);
  }

  console.log("Creating paid orders...");
  let totalOrdersCreated = 0;
  for (let i = 0; i < 200; i++) {
    const customer = faker.helpers.arrayElement(customers);
    const orderProducts = faker.helpers.arrayElements(products, faker.number.int({ min: 1, max: 3 }));
    const items = orderProducts.map((p) => ({ productId: p.id, quantity: faker.number.int({ min: 1, max: 2 }), unitPriceInPaise: p.priceInPaise }));
    const subtotalInPaise = items.reduce((s, i) => s + i.unitPriceInPaise * i.quantity, 0);
    const discountInPaise = faker.helpers.maybe(() => faker.number.int({ min: 10000, max: 30000 }), { probability: 0.15 }) ?? 0;
    const shippingInPaise = subtotalInPaise > 100000 ? 0 : 4900;
    const totalInPaise = Math.max(0, subtotalInPaise - discountInPaise) + shippingInPaise;
    const createdAt = faker.date.recent({ days: 45 });

    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: customer.id,
        status: "PAID",
        subtotalInPaise,
        discountInPaise,
        shippingInPaise,
        totalInPaise,
        createdAt,
        updatedAt: createdAt,
        items: { create: items },
      },
    });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayOrderId: `order_seed_${order.id.slice(0, 12)}`,
        razorpayPaymentId: `pay_seed_${order.id.slice(0, 12)}`,
        amountInPaise: totalInPaise,
        status: "CAPTURED",
        idempotencyKey: `idem_seed_${order.id}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.customer.update({
      where: { id: customer.id },
      data: { totalSpentInPaise: { increment: totalInPaise }, ordersCount: { increment: 1 } },
    });
    totalOrdersCreated++;
  }
  console.log(`Created ${totalOrdersCreated} paid orders.`);

  console.log("Creating abandoned carts...");
  for (let i = 0; i < 50; i++) {
    const customer = faker.helpers.arrayElement(customers);
    const cartProducts = faker.helpers.arrayElements(products, faker.number.int({ min: 1, max: 3 }));
    const cart = await prisma.cart.create({
      data: {
        merchantId: merchant.id,
        customerId: customer.id,
        status: "ABANDONED",
        updatedAt: faker.date.recent({ days: 14 }),
        items: {
          create: cartProducts.map((p) => ({ productId: p.id, quantity: faker.number.int({ min: 1, max: 2 }), unitPriceInPaise: p.priceInPaise })),
        },
      },
    });
  }

  console.log("Creating failed payments...");
  for (let i = 0; i < 20; i++) {
    const customer = faker.helpers.arrayElement(customers);
    const p = faker.helpers.arrayElement(products);
    const totalInPaise = p.priceInPaise;
    const createdAt = faker.date.recent({ days: 30 });
    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: customer.id,
        status: "FAILED",
        subtotalInPaise: totalInPaise,
        totalInPaise,
        createdAt,
        updatedAt: createdAt,
        items: { create: [{ productId: p.id, quantity: 1, unitPriceInPaise: p.priceInPaise }] },
      },
    });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayOrderId: `order_seed_failed_${order.id.slice(0, 10)}`,
        amountInPaise: totalInPaise,
        status: "FAILED",
        failureReason: faker.helpers.arrayElement(["Card declined by issuing bank", "Insufficient funds", "Payment timed out", "Bank server error"]),
        idempotencyKey: `idem_seed_failed_${order.id}`,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }

  console.log("Creating campaigns...");
  const campaignTitles = [
    "Weekend Abandoned Cart Recovery",
    "Fitness Category Spring Push",
    "High-Value Customer Win-Back",
    "Electronics Flash Bundle",
    "New Customer Welcome Offer",
    "Festive Season Early Access",
    "Running Shoes Restock Alert Offer",
    "Loyalty Tier Upgrade Bonus",
    "Home Essentials Bundle Deal",
    "Accessories Cross-Sell Push",
  ];
  const statuses = ["PROPOSED", "APPROVED", "REJECTED", "COMPLETED"];
  for (const title of campaignTitles) {
    const discountInPaise = faker.number.int({ min: 10000, max: 50000 });
    await prisma.campaign.create({
      data: {
        merchantId: merchant.id,
        title,
        goal: "Increase revenue via targeted recovery/promotion",
        offerDescription: `₹${discountInPaise / 100} discount for the targeted audience`,
        discountInPaise,
        estimatedRecoverableInPaise: faker.number.int({ min: 500000, max: 5000000 }),
        riskLevel: faker.helpers.arrayElement(["LOW", "MEDIUM", "HIGH"]),
        status: faker.helpers.arrayElement(statuses),
      },
    });
  }

  console.log("Creating knowledge documents (lightweight RAG source)...");
  await prisma.knowledgeDocument.createMany({
    data: [
      {
        merchantId: merchant.id,
        title: "Return Policy",
        category: "return_policy",
        content:
          "Urban Stride Co. accepts returns within 30 days of delivery for unused items in original packaging. Refunds are issued to the original payment method within 5-7 business days after the returned item is received and inspected. Sale items marked 'final sale' are not eligible for return.",
      },
      {
        merchantId: merchant.id,
        title: "Shipping Policy",
        category: "shipping_policy",
        content:
          "Orders over ₹1,000 ship free. Orders under ₹1,000 have a flat ₹49 shipping fee. Standard delivery takes 2-4 business days across India. Express delivery (1-2 business days) is available at checkout for an additional fee in select pin codes.",
      },
      {
        merchantId: merchant.id,
        title: "Discount Policy",
        category: "discount_policy",
        content:
          "Discounts are capped at ₹500 per order under current merchant policy. Discounts from marketing campaigns require merchant approval before they can be redeemed at checkout. Stacking multiple discount codes on a single order is not supported.",
      },
      {
        merchantId: merchant.id,
        title: "Frequently Asked Questions",
        category: "faq",
        content:
          "Q: How do I track my order? A: You'll receive a tracking link by email once your order ships. Q: Can I change my order after placing it? A: Orders can be modified within 1 hour of placement by contacting support. Q: Do you ship internationally? A: Currently Urban Stride Co. only ships within India.",
      },
    ],
  });

  console.log("Creating sample audit logs...");
  const auditSamples: { category: string; actor: string; action: string; summary: string; status: string }[] = [];
  for (let i = 0; i < 100; i++) {
    const kind = faker.helpers.arrayElement(["AGENT", "PAYMENT", "CAMPAIGN", "POLICY", "APPROVAL", "FAILURE"] as const);
    let entry;
    switch (kind) {
      case "AGENT":
        entry = { category: kind, actor: "agent:revenue_agent", action: "TOOL_CALL", summary: "Nova queried revenue summary for the merchant dashboard.", status: "SUCCESS" };
        break;
      case "PAYMENT":
        entry = { category: kind, actor: "system", action: "PAYMENT_VERIFIED", summary: "Payment verified and order marked PAID.", status: "SUCCESS" };
        break;
      case "CAMPAIGN":
        entry = { category: kind, actor: "agent:campaign_orchestrator", action: "CAMPAIGN_PROPOSED", summary: "Draft campaign proposed for abandoned cart recovery.", status: "SUCCESS" };
        break;
      case "POLICY":
        entry = { category: kind, actor: "user:admin", action: "POLICY_UPDATED", summary: "Merchant updated maximum discount policy.", status: "SUCCESS" };
        break;
      case "APPROVAL":
        entry = { category: kind, actor: "user:admin", action: "CAMPAIGN_APPROVED", summary: "Merchant approved a proposed campaign.", status: "SUCCESS" };
        break;
      default:
        entry = { category: kind, actor: "system", action: "SIMULATED_PAYMENT_FAILURE", summary: "Simulated payment failure — order correctly remained unpaid.", status: "FAILED" };
    }
    auditSamples.push(entry);
  }
  await prisma.auditLog.createMany({
    data: auditSamples.map((e) => ({ merchantId: merchant.id, ...e, createdAt: faker.date.recent({ days: 30 }) } as any)),
  });

  console.log("\nSeed complete.");
  console.log("Demo login: demo@merqora.dev / Demo@12345");
  console.log(`Merchant ID (for DEMO_MERCHANT_ID env if needed): ${merchant.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
