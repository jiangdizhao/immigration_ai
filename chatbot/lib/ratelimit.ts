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

type RateLimitStore = {
  isReady: boolean;
  incrementWithExpiry: (
    key: string,
    ttlSeconds: number
  ) => Promise<number | undefined>;
};

type RateLimitCheckerDependencies = {
  getStore?: () => RateLimitStore | null;
  isProduction?: boolean;
};

type RateLimitCheckMode = { failClosed?: boolean };

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

function getRedisRateLimitStore(): RateLimitStore | null {
  const redis = getClient();
  if (!redis) {
    return null;
  }
  return {
    get isReady() {
      return redis.isReady;
    },
    async incrementWithExpiry(key, ttlSeconds) {
      const [count] = await redis
        .multi()
        .incr(key)
        .expire(key, ttlSeconds, "NX")
        .exec();
      return typeof count === "number" ? count : undefined;
    },
  };
}

export function createIpRateLimitChecker(
  dependencies: RateLimitCheckerDependencies = {}
) {
  const getStore = dependencies.getStore ?? getRedisRateLimitStore;
  const isProduction = dependencies.isProduction ?? isProductionEnvironment;

  return async function checkIpRateLimitWithMode(
    ip: string | undefined,
    options: RateLimitOptions = {},
    mode: RateLimitCheckMode = {}
  ) {
    const failClosed = mode.failClosed === true;
    if (!failClosed && (!isProduction || !ip)) {
      return;
    }
    if (!ip) {
      throw new ChatbotError("offline:api");
    }

    let store: RateLimitStore | null;
    try {
      store = getStore();
    } catch {
      if (failClosed) {
        throw new ChatbotError("offline:api");
      }
      return;
    }
    if (!store?.isReady) {
      if (failClosed) {
        throw new ChatbotError("offline:api");
      }
      return;
    }

    try {
      const key = `${options.keyPrefix ?? "ip-rate-limit"}:${ip}`;
      const count = await store.incrementWithExpiry(
        key,
        options.ttlSeconds ?? TTL_SECONDS
      );
      if (typeof count !== "number") {
        if (failClosed) {
          throw new ChatbotError("offline:api");
        }
        return;
      }
      if (count > (options.maxRequests ?? MAX_MESSAGES)) {
        throw new ChatbotError("rate_limit:chat");
      }
    } catch (error) {
      if (error instanceof ChatbotError) {
        throw error;
      }
      if (failClosed) {
        throw new ChatbotError("offline:api");
      }
    }
  };
}

const checkIpRateLimitWithMode = createIpRateLimitChecker();

export function checkIpRateLimit(
  ip: string | undefined,
  options: RateLimitOptions = {}
) {
  return checkIpRateLimitWithMode(ip, options);
}

export function checkIpRateLimitStrict(
  ip: string | undefined,
  options: RateLimitOptions = {}
) {
  return checkIpRateLimitWithMode(ip, options, { failClosed: true });
}
