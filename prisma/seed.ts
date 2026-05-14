import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PLANS = [
  {
    code: "free",
    name: "Free",
    price_monthly: 0,
    monthly_credits: BigInt(100_000),
    sort_order: 0,
    features: {
      "chat.model.sonnet": false,
      "chat.model.opus": false,
      pagebuilder: false,
      trade_module: false,
      "rag.advanced": false,
      "analytics.ga4": true,
      "analytics.weekly_summary": false,
      "analytics.anomaly_detection": false,
      "analytics.max_connections": 1,
      "team.max_members": 1,
    },
  },
  {
    code: "starter",
    name: "Starter",
    price_monthly: 99_000,
    monthly_credits: BigInt(1_000_000),
    sort_order: 1,
    features: {
      "chat.model.sonnet": true,
      "chat.model.opus": false,
      pagebuilder: true,
      "pagebuilder.max_sites": 1,
      trade_module: false,
      "rag.advanced": false,
      "analytics.ga4": true,
      "analytics.weekly_summary": false,
      "analytics.anomaly_detection": false,
      "analytics.max_connections": 3,
      "team.max_members": 3,
    },
  },
  {
    code: "pro",
    name: "Pro",
    price_monthly: 299_000,
    monthly_credits: BigInt(5_000_000),
    sort_order: 2,
    features: {
      "chat.model.sonnet": true,
      "chat.model.opus": true,
      pagebuilder: true,
      "pagebuilder.max_sites": 5,
      "pagebuilder.custom_domain": true,
      trade_module: true,
      "rag.advanced": true,
      "analytics.ga4": true,
      "analytics.weekly_summary": true,
      "analytics.anomaly_detection": true,
      "analytics.max_connections": 10,
      "team.max_members": 10,
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    price_monthly: 0,
    monthly_credits: BigInt(0),
    sort_order: 3,
    features: {
      "chat.model.sonnet": true,
      "chat.model.opus": true,
      pagebuilder: true,
      "pagebuilder.max_sites": 9999,
      "pagebuilder.custom_domain": true,
      trade_module: true,
      "rag.advanced": true,
      "analytics.ga4": true,
      "analytics.weekly_summary": true,
      "analytics.anomaly_detection": true,
      "analytics.max_connections": 9999,
      "team.max_members": 9999,
      api_access: true,
    },
  },
];

async function main() {
  console.log("Seeding trade categories...");
  const tradeCategories = [
    { name: "食品", slug: "food", sort_order: 0 },
    { name: "美妝", slug: "beauty", sort_order: 1 },
    { name: "雜貨", slug: "general", sort_order: 2 },
    { name: "電器", slug: "electronics", sort_order: 3 },
    { name: "其他", slug: "other", sort_order: 4 },
  ];
  for (const category of tradeCategories) {
    await prisma.tradeCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        sort_order: category.sort_order,
        active: true,
      },
      create: {
        ...category,
        active: true,
      },
    });
  }

  console.log("Seeding plans...");
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        price_monthly: p.price_monthly,
        monthly_credits: p.monthly_credits,
        sort_order: p.sort_order,
        features: p.features,
      },
      create: p,
    });
  }

  const [freePlan, proPlan] = await Promise.all([
    prisma.plan.findUniqueOrThrow({ where: { code: "free" } }),
    prisma.plan.findUniqueOrThrow({ where: { code: "pro" } }),
  ]);

  console.log("Seeding admin user...");
  const adminEmail = "admin@platform.local";
  const adminPwd = await bcrypt.hash("admin12345", 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password_hash: adminPwd,
      type: "personal",
      role: "super_admin",
      display_name: "Admin",
    },
  });

  console.log("Seeding test users...");

  const testUserPwd = await bcrypt.hash("test12345", 12);
  const testUser = await prisma.user.upsert({
    where: { email: "test@platform.local" },
    update: {
      password_hash: testUserPwd,
      display_name: "Test User",
      status: "active",
    },
    create: {
      email: "test@platform.local",
      password_hash: testUserPwd,
      type: "personal",
      role: "user",
      display_name: "Test User",
    },
  });

  await prisma.subscription.upsert({
    where: { user_id: testUser.id },
    update: {
      plan_id: freePlan.id,
      status: "active",
      current_period_start: new Date("2026-04-01T00:00:00.000Z"),
      current_period_end: new Date("2026-05-01T00:00:00.000Z"),
      cancel_at_period_end: false,
    },
    create: {
      user_id: testUser.id,
      plan_id: freePlan.id,
      status: "active",
      current_period_start: new Date("2026-04-01T00:00:00.000Z"),
      current_period_end: new Date("2026-05-01T00:00:00.000Z"),
    },
  });

  const tradeUserPwd = await bcrypt.hash("trade12345", 12);
  const tradeUser = await prisma.user.upsert({
    where: { email: "trade@platform.local" },
    update: {
      password_hash: tradeUserPwd,
      display_name: "Trade Tester",
      status: "active",
    },
    create: {
      email: "trade@platform.local",
      password_hash: tradeUserPwd,
      type: "company",
      role: "user",
      display_name: "Trade Tester",
      company: {
        create: {
          tax_id: "12345675",
          name: "Trade Tester Co.",
          address: "Taipei, Taiwan",
          verified: false,
          verified_source: "seed",
        },
      },
    },
    include: { company: true },
  });

  await prisma.subscription.upsert({
    where: { user_id: tradeUser.id },
    update: {
      plan_id: proPlan.id,
      status: "active",
      current_period_start: new Date("2026-04-01T00:00:00.000Z"),
      current_period_end: new Date("2026-05-01T00:00:00.000Z"),
      cancel_at_period_end: false,
    },
    create: {
      user_id: tradeUser.id,
      plan_id: proPlan.id,
      status: "active",
      current_period_start: new Date("2026-04-01T00:00:00.000Z"),
      current_period_end: new Date("2026-05-01T00:00:00.000Z"),
    },
  });

  await prisma.tradeProfile.upsert({
    where: { user_id: tradeUser.id },
    update: {
      role: "both",
      description: "Seeded trade testing account",
      product_categories: ["Industrial Components", "Fasteners"],
      target_markets: ["US", "Japan", "Southeast Asia"],
      capacity: "MOQ 1000 / lead time 30 days",
    },
    create: {
      user_id: tradeUser.id,
      role: "both",
      description: "Seeded trade testing account",
      product_categories: ["Industrial Components", "Fasteners"],
      target_markets: ["US", "Japan", "Southeast Asia"],
      capacity: "MOQ 1000 / lead time 30 days",
    },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
