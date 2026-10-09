# STRIPE CHINA PAYMENTS — 2026-10-10

**Status:** ACTIVE / OWNER-APPROVED  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Execution style:** ONE implementation pass; concentrated validation; STOP for external review  
**Decision authority:** D-056

## Goal

Add mainland-China-friendly VIP payments quickly without replacing Stripe or redesigning the established Phase-9 billing system.

The shipped behavior for this task is:

1. Existing **AUD card monthly subscription** continues to work exactly as today.
2. **Alipay + CNY monthly recurring VIP** is added through Stripe, but exposed only when recurring Alipay is genuinely enabled/approved for the live Stripe account/configuration.
3. **WeChat Pay + CNY one-time payment** is added through Stripe Checkout and grants exactly **30 days of prepaid VIP**. It does not auto-renew.

## Non-negotiable billing and entitlement rules

- Stripe remains the only payment provider in this task.
- The browser redirect state is never authority for VIP activation.
- Only verified server-side Stripe payment/webhook evidence can activate or extend VIP.
- Provider/webhook retries must be idempotent.
- Existing paid VIP time must not be lost. For a successful WeChat prepaid purchase:
  `newExpiry = max(now, currentVipExpiry) + 30 days`.
- Existing card subscription, cancellation-at-period-end, billing portal, notification/outbox and trusted entitlement behavior must not regress.
- Alipay recurring must fail closed if the account/configuration does not support it. Do not silently substitute prepaid Alipay while labelling it recurring.
- If the implementation needs a new schema/migration, make it additive and repository-tracked. Do not apply a new migration to staging/production as part of this coding task.

## Fast-delivery scope

### Existing AUD card path

Preserve the current recurring path and its local/provider bookkeeping.

### Alipay

Target UI/product semantics:

- CNY monthly price;
- Stripe-hosted recurring checkout/authorization path appropriate to the account's enabled Alipay recurring capability;
- automatic monthly renewal only when Stripe actually supports it for this account;
- normal recurring subscription cancellation/status semantics should reuse the existing trusted subscription lifecycle as much as safely possible.

Configuration/capability must be explicit and server-owned. No UI-only enablement.

### WeChat Pay

Target UI/product semantics:

- CNY price;
- Stripe Checkout `mode=payment`;
- payment method `wechat_pay`;
- one successful verified payment grants/extends VIP by 30 days;
- user renews by purchasing again;
- no subscription object, auto-renew claim or cancel-renewal UI for this prepaid purchase.

## Existing code that must be inspected before implementation

At minimum inspect the live branch versions of:

- `chatbot/lib/db/schema.ts` — `VipPlanPrice`, `VipSubscription`, `VipPurchase`, billing event/outbox tables, user VIP fields;
- `chatbot/lib/vip/billing/stripe-adapter.ts`;
- `chatbot/lib/vip/billing/types.ts`;
- `chatbot/lib/vip/billing/config.ts`;
- `chatbot/lib/vip/billing/checkout-api.ts` and checkout route(s);
- `chatbot/lib/vip/billing/webhook-*.ts`;
- `chatbot/lib/vip/billing/provisioning.ts`;
- `chatbot/lib/vip/billing/price-service.ts` and admin pricing code;
- VIP status/entitlement queries and APIs;
- `chatbot/components/vip-membership-client.tsx`;
- the historical simulation/one-time `VipPurchase` flow, because it may provide reusable prepaid persistence semantics.

Prefer reuse and a minimal additive patch. Do not create a generic payment framework unless the existing code demonstrably cannot support the two required flows safely.

## Pricing/configuration

- No live FX conversion in this task.
- AUD card price remains under the existing system.
- CNY Alipay monthly and CNY WeChat 30-day prices must be explicit server-owned configuration/data, not browser-supplied trusted amounts.
- Do not invent or hard-code a business price if the repository/account does not already provide one. Make missing CNY price configuration produce a safe unavailable state and document the exact configuration needed for activation.

## UI

The VIP page should present the options clearly without exposing internal Stripe/provider terminology beyond what users need:

- Card — AUD monthly subscription;
- Alipay — CNY monthly auto-renewing subscription, only when available;
- WeChat Pay — CNY / 30-day prepaid, renew by purchasing again.

For an active prepaid-only VIP, do not show misleading “renews automatically” or “cancel renewal” copy. Existing recurring subscribers keep the current management/cancellation experience.

Preserve the site's current locale behavior; do not perform a broad localization rewrite in this task.

## Validation / acceptance

The implementation pass must add/adjust focused tests that prove at least:

- existing AUD card subscription checkout behavior is unchanged;
- Alipay recurring checkout/config is server-owned and unavailable when capability/config is absent;
- WeChat uses one-time Checkout/payment semantics, not subscription semantics;
- trusted WeChat payment completion grants exactly 30 days from `max(now, current expiry)`;
- duplicate WeChat webhook/event delivery does not double-extend VIP;
- browser `checkout=success` alone cannot activate or extend VIP;
- an active prepaid VIP receives correct status/UI semantics without recurring cancellation copy;
- existing recurring subscription webhook/status/cancellation tests remain green;
- invalid/tampered payment method, amount, currency, user or metadata cannot grant VIP.

Run focused billing tests, the relevant unit suite, changed-file Biome, `git diff --check`, and a production build if the local environment can complete it. Do not perform real-money payment or production/staging mutation in this coding task.

## Stop condition / report

When implementation and local deterministic validation are complete:

- leave the implementation **uncommitted and unpushed** for external review;
- report exact changed files;
- report any generated migration name and confirm whether it was applied anywhere;
- report all tests/checks and exact results;
- report all new server-side environment/configuration keys;
- explicitly state whether Alipay recurring still requires Stripe-account approval/configuration before it can be enabled;
- do not deploy, alter Stripe live settings, run a real payment, or broaden the task.
