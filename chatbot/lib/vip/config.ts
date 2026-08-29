export type VipProductConfig = {
  provider: "simulation";
  amountMinor: number;
  currency: "AUD";
  durationDays: number;
};

const DEFAULT_AMOUNT_MINOR = 9900;
const DEFAULT_DURATION_DAYS = 30;

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function isVipSimulationEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const isProduction =
    env.NODE_ENV === "production" ||
    env.APP_ENV === "production" ||
    env.VERCEL_ENV === "production";
  return (
    !isProduction &&
    env.VIP_PAYMENT_PROVIDER === "simulation" &&
    env.VIP_SIMULATED_PAYMENT_ENABLED === "true"
  );
}

export function getVipProductConfig(
  env: NodeJS.ProcessEnv = process.env
): VipProductConfig {
  if (!isVipSimulationEnabled(env)) {
    throw new Error("VIP simulated payment is not enabled in this environment");
  }

  return {
    provider: "simulation",
    amountMinor: positiveInteger(env.VIP_PRICE_MINOR, DEFAULT_AMOUNT_MINOR),
    currency: "AUD",
    durationDays: positiveInteger(env.VIP_DURATION_DAYS, DEFAULT_DURATION_DAYS),
  };
}
