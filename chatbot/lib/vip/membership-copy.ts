export function getVipRenewalPresentation(
  subscription: { status: string; cancelAtPeriodEnd: boolean } | null
) {
  if (!subscription || subscription.status !== "active") {
    return {
      renewalCopy: "This prepaid membership does not renew automatically.",
      showBillingManagement: false,
      showCancelRenewal: false,
    };
  }

  if (subscription.cancelAtPeriodEnd) {
    return {
      renewalCopy:
        "Renewal is cancelled; membership stays active until the end of the paid period.",
      showBillingManagement: true,
      showCancelRenewal: false,
    };
  }

  return {
    renewalCopy: "Renews automatically until cancelled.",
    showBillingManagement: true,
    showCancelRenewal: true,
  };
}

export function getVipCheckoutReturnNotice(search: string): string | null {
  const checkout = new URLSearchParams(search).get("checkout");
  if (checkout === "success") {
    return "Payment submitted. Membership activates after secure payment confirmation.";
  }
  if (checkout === "cancelled") {
    return "Checkout was cancelled. You were not charged.";
  }
  return null;
}
