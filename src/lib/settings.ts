import { prisma } from "./db";

// Singletons are created on first access so the app works immediately after migrate.
export async function getSettings() {
  return prisma.globalSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

export async function getProfile() {
  return prisma.businessProfile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}
