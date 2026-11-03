import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto";

const prisma = new PrismaClient();

const SERVICES = [
  ["Website development", "website-development", "Design and build of new business websites."],
  ["Website redesign", "website-redesign", "Rework of an existing site's structure, content and interface."],
  ["WordPress & CMS development", "wordpress-cms", "WordPress and other CMS builds and customisation."],
  ["eCommerce development", "ecommerce", "Online stores and checkout experiences."],
  ["AI agents & support assistants", "ai-agents", "Customer-support assistants and task agents where there is a clear, evidenced need."],
  ["Workflow automation", "workflow-automation", "Automating repetitive business processes."],
  ["CRM integrations", "crm-integrations", "Connecting CRMs and business tools."],
  ["Custom web applications", "custom-web-apps", "Bespoke web applications."],
];

async function main() {
  const email = (process.env.OWNER_EMAIL || "itsfadii@icloud.com").toLowerCase();
  let password = process.env.OWNER_PASSWORD || "";
  let generated = false;
  if (!password) {
    password = randomBytes(12).toString("base64url");
    generated = true;
  }

  const existing = await prisma.owner.findUnique({ where: { email } });
  if (existing) {
    if (process.env.OWNER_PASSWORD) {
      await prisma.owner.update({ where: { email }, data: { passwordHash: hashPassword(password) } });
      console.log(`Updated password for ${email}.`);
    } else {
      console.log(`Owner ${email} already exists. Set OWNER_PASSWORD to reset it.`);
    }
  } else {
    await prisma.owner.create({ data: { email, passwordHash: hashPassword(password), name: "Shah Fahad" } });
    console.log(`\n=== OWNER CREATED ===`);
    console.log(`Email:    ${email}`);
    if (generated) console.log(`Password: ${password}   (shown once — change it in Settings → Security)`);
    console.log(`=====================\n`);
  }

  await prisma.globalSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });
  await prisma.businessProfile.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: {} });

  for (let i = 0; i < SERVICES.length; i++) {
    const [name, slug, description] = SERVICES[i];
    await prisma.service.upsert({
      where: { slug },
      create: { name, slug, description, sortOrder: i },
      update: {},
    });
  }

  const seqCount = await prisma.followUpSequence.count();
  if (seqCount === 0) {
    await prisma.followUpSequence.create({
      data: {
        name: "Default (2 follow-ups)",
        steps: {
          create: [
            { stepOrder: 1, delayHours: 72, instruction: "Short, polite nudge referencing the original evidenced point. One sentence plus a simple question." },
            { stepOrder: 2, delayHours: 168, instruction: "Final brief note offering to step back. No pressure, no new claims." },
          ],
        },
      },
    });
  }

  for (const kind of ["AI_OPENAI", "AI_ANTHROPIC", "AI_CLAUDE_CODE", "AI_CODEX", "SEARCH", "EMAIL_VERIFIER"] as const) {
    await prisma.providerConnection.upsert({
      where: { kind_name: { kind, name: "default" } },
      create: { kind, name: "default", status: "UNCONFIGURED" },
      update: {},
    });
  }

  console.log("Seed complete: settings, profile, services, follow-up sequence, provider slots.");
}

main().then(() => prisma.$disconnect()).catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
