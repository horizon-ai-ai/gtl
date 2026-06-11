import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PLANS = [
  {
    code: "free",
    name: "Seed 種子體驗",
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
      "chat.monthly_limit": 100,
      "image.monthly_limit_1k": 10,
      "image.watermark": true,
      "onepage.monthly_limit": 1,
      "onepage.download": false,
    },
  },
  {
    code: "starter",
    name: "Rise 入門版",
    price_monthly: 29_900,
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
      "team.max_members": 1,
      "image.monthly_limit_1k": 30,
      "image.watermark": true,
      "onepage.monthly_limit": 2,
      "onepage.download": false,
    },
  },
  {
    code: "pro",
    name: "Win 進階版",
    price_monthly: 198_000,
    monthly_credits: BigInt(5_000_000),
    sort_order: 2,
    features: {
      "chat.model.sonnet": true,
      "chat.model.opus": true,
      pagebuilder: true,
      "pagebuilder.max_sites": 5,
      "pagebuilder.custom_domain": true,
      trade_module: false,
      "rag.advanced": true,
      "analytics.ga4": true,
      "analytics.weekly_summary": true,
      "analytics.anomaly_detection": true,
      "analytics.max_connections": 10,
      "team.max_members": 1,
      "image.watermark": false,
      "image.monthly_limit_1k": 50,
      "image.monthly_limit_2k": 20,
      "image.monthly_limit_4k": 5,
      "onepage.monthly_limit": 2,
      "onepage.download": true,
    },
  },
  {
    code: "lead",
    name: "Lead 商業版",
    price_monthly: 598_000,
    monthly_credits: BigInt(10_000_000),
    sort_order: 3,
    features: {
      "chat.model.sonnet": true,
      "chat.model.opus": true,
      pagebuilder: true,
      "pagebuilder.max_sites": 5,
      "pagebuilder.custom_domain": true,
      trade_module: true,
      "trade.max_products": 2,
      "trade.max_inquiries": 20,
      "rag.advanced": true,
      "analytics.ga4": true,
      "analytics.weekly_summary": true,
      "analytics.anomaly_detection": true,
      "analytics.max_connections": 10,
      "team.max_members": 3,
      "image.watermark": false,
      "image.monthly_limit_1k": 100,
      "image.monthly_limit_2k": 50,
      "image.monthly_limit_4k": 10,
      "onepage.monthly_limit": 10,
      "onepage.download": true,
      trial_available: true,
    },
  },
  {
    code: "prime",
    name: "Prime 團隊版",
    price_monthly: 1_280_000,
    monthly_credits: BigInt(30_000_000),
    sort_order: 4,
    features: {
      "chat.model.sonnet": true,
      "chat.model.opus": true,
      pagebuilder: true,
      "pagebuilder.max_sites": 10,
      "pagebuilder.custom_domain": true,
      trade_module: true,
      "trade.max_products": 1000,
      "rag.advanced": true,
      "analytics.ga4": true,
      "analytics.weekly_summary": true,
      "analytics.anomaly_detection": true,
      "analytics.max_connections": 20,
      "team.max_members": 5,
      "image.watermark": false,
      "image.monthly_limit_1k": 500,
      "image.monthly_limit_2k": 200,
      "image.monthly_limit_4k": 100,
      "onepage.download": true,
      trial_available: true,
    },
  },
  {
    code: "enterprise",
    name: "客製化服務",
    price_monthly: 0,
    monthly_credits: BigInt(0),
    sort_order: 5,
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
      custom_service: true,
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

  const [freePlan, leadPlan] = await Promise.all([
    prisma.plan.findUniqueOrThrow({ where: { code: "free" } }),
    prisma.plan.findUniqueOrThrow({ where: { code: "lead" } }),
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
      plan_id: leadPlan.id,
      status: "active",
      current_period_start: new Date("2026-04-01T00:00:00.000Z"),
      current_period_end: new Date("2026-05-01T00:00:00.000Z"),
      cancel_at_period_end: false,
    },
    create: {
      user_id: tradeUser.id,
      plan_id: leadPlan.id,
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
