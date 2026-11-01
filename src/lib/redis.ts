import IORedis from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

// BullMQ requires maxRetriesPerRequest = null on the shared connection.
export const connection =
  globalForRedis.redis ??
  new IORedis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = connection;
