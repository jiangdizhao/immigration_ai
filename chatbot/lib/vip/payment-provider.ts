import { randomUUID } from "node:crypto";
import { getVipProductConfig, isVipSimulationEnabled } from "./config";

export type VipPaymentStatus = "pending" | "paid" | "failed" | "cancelled";

export type VipCheckout = {
  provider: string;
  providerPaymentId: string;
  status: "pending";
  amountMinor: number;
  currency: string;
};

export type VipPaymentVerification = {
  provider: string;
  providerPaymentId: string;
  status: VipPaymentStatus;
};

export interface VipPaymentProvider {
  readonly name: string;
  createCheckout(input: {
    amountMinor: number;
    currency: string;
    userId: string;
  }): Promise<VipCheckout>;
  verifyPayment(input: {
    providerPaymentId: string;
    userId: string;
  }): Promise<VipPaymentVerification>;
  cancelCheckout(input: {
    providerPaymentId: string;
    userId: string;
  }): Promise<VipPaymentVerification>;
}

type SimulationRecord = VipPaymentVerification & {
  userId: string;
  amountMinor: number;
  currency: string;
};

const simulationRecords = new Map<string, SimulationRecord>();

export class SimulatedVipPaymentProvider implements VipPaymentProvider {
  readonly name = "simulation";

  createCheckout(input: {
    amountMinor: number;
    currency: string;
    userId: string;
  }): Promise<VipCheckout> {
    const providerPaymentId = `sim_${randomUUID()}`;
    simulationRecords.set(providerPaymentId, {
      provider: this.name,
      providerPaymentId,
      status: "pending",
      userId: input.userId,
      amountMinor: input.amountMinor,
      currency: input.currency,
    });
    return Promise.resolve({
      provider: this.name,
      providerPaymentId,
      status: "pending",
      amountMinor: input.amountMinor,
      currency: input.currency,
    });
  }

  verifyPayment(input: {
    providerPaymentId: string;
    userId: string;
  }): Promise<VipPaymentVerification> {
    const record = simulationRecords.get(input.providerPaymentId);
    if (!record || record.userId !== input.userId) {
      return Promise.resolve({
        provider: this.name,
        providerPaymentId: input.providerPaymentId,
        status: "failed",
      });
    }

    // A simulated checkout represents an explicit local successful-payment
    // action once confirmed. The server still verifies that the reference was
    // issued for this user and never accepts a browser success flag.
    if (record.status === "pending") {
      record.status = "paid";
    }
    return Promise.resolve({ ...record });
  }

  cancelCheckout(input: {
    providerPaymentId: string;
    userId: string;
  }): Promise<VipPaymentVerification> {
    const record = simulationRecords.get(input.providerPaymentId);
    if (!record || record.userId !== input.userId) {
      return Promise.resolve({
        provider: this.name,
        providerPaymentId: input.providerPaymentId,
        status: "failed",
      });
    }
    if (record.status === "pending") {
      record.status = "cancelled";
    }
    return Promise.resolve({ ...record });
  }
}

let configuredProvider: SimulatedVipPaymentProvider | null = null;

export function getVipPaymentProvider(): VipPaymentProvider {
  if (!isVipSimulationEnabled()) {
    throw new Error("No VIP payment provider is enabled");
  }
  if (!configuredProvider) {
    configuredProvider = new SimulatedVipPaymentProvider();
  }
  return configuredProvider;
}

export function getSimulationProduct() {
  return getVipProductConfig();
}
