import { createClient } from "redis";

import { isProductionEnvironment } from "@/lib/constants";
import { ChatbotError } from "@/lib/errors";

const MAX_MESSAGES = 10;
const TTL_SECONDS = 60 * 60;

type RateLimitOptions = {
  keyPrefix?: string;
  maxRequests?: number;
  ttlSeconds?: number;
};

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client && process.env.REDIS_URL) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => undefined);
    client.connect().catch(() => {
      client = null;
    });
  }
  return client;
}

export async function checkIpRateLimit(
  ip: string | undefined,
  options: RateLimitOptions = {}
) {
  if (!isProductionEnvironment || !ip) {
    return;
  }

  const redis = getClient();
  if (!redis?.isReady) {
    return;
  }

  try {
    const key = `${options.keyPrefix ?? "ip-rate-limit"}:${ip}`;
    const maxRequests = options.maxRequests ?? MAX_MESSAGES;
    const ttlSeconds = options.ttlSeconds ?? TTL_SECONDS;
    const [count] = await redis
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, "NX")
      .exec();

    if (typeof count === "number" && count > maxRequests) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (error) {
    if (error instanceof ChatbotError) {
      throw error;
    }
  }
}
