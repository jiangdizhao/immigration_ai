# STRIPE CHINA PAYMENTS — 2026-10-10

**Status:** IMPLEMENTATION COMPLETE / EXTERNAL REVIEW PENDING
**Branch:** `feature/stripe-china-wechat-prepaid-20261010` (based on canonical `phase11-chinese-service-platform-ui-rebase` at `0033c878bd9a3a8f4d16f5f910dd9fa7d1248433`)
**Execution style:** ONE implementation pass; concentrated validation; push feature branch and stop for external review
**Decision authority:** D-056

## Goal

Add mainland-China-friendly VIP payments quickly without replacing Stripe or redesigning the established Phase-9 billing system.

The implementation in this pass is:

1. Existing **AUD card monthly subscription** continues to work exactly as today.
2. **Alipay recurring VIP remains unavailable.** Stripe account approval and its supported authorization flow have not been granted; no Alipay integration or configuration was added.
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

Deferred by owner decision. Keep status unavailable and checkout fail-closed until Stripe grants account access and the supported authorization flow is separately reviewed and implemented. Do not configure Stripe, add credentials, or introduce Alipay keys in this pass.

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
- CNY WeChat 30-day price is server-owned configuration, not a browser-supplied amount. Account configuration, Stripe credentials, and the business-approved CNY amount are deferred.
- WeChat is unavailable unless its enable flag, valid positive-integer amount, Stripe API configuration, and webhook signing secret are present. Do not configure these values in this task.

## UI

The VIP page should present the options clearly without exposing internal Stripe/provider terminology beyond what users need:

- Card — AUD monthly subscription;
- WeChat Pay — CNY / 30-day prepaid, renew by purchasing again.

Alipay is omitted while unavailable.

For an active prepaid-only VIP, do not show misleading “renews automatically” or “cancel renewal” copy. Existing recurring subscribers keep the current management/cancellation experience.

Preserve the site's current locale behavior; do not perform a broad localization rewrite in this task.

## Validation / acceptance

The implementation pass must add/adjust focused tests that prove at least:

- existing AUD card subscription checkout behavior is unchanged;
- Alipay recurring remains unavailable and checkout fails closed;
- WeChat uses one-time Checkout/payment semantics, not subscription semantics;
- trusted WeChat payment completion grants exactly 30 days from `max(now, current expiry)`;
- duplicate WeChat webhook/event delivery does not double-extend VIP;
- browser `checkout=success` alone cannot activate or extend VIP;
- an active prepaid VIP receives correct status/UI semantics without recurring cancellation copy;
- existing recurring subscription webhook/status/cancellation tests remain green;
- invalid/tampered payment method, amount, currency, user or metadata cannot grant VIP.

Run focused billing tests, changed-file Biome, and `git diff --check`. Do not perform real-money payment or production/staging mutation in this coding task. Stripe configuration, credentials, CNY prices, and live payment testing are deferred.

## Stop condition / report

When implementation and local deterministic validation are complete:

- commit and push the reviewed implementation to the separate feature branch based on the current canonical branch, then stop for external code review;
- report exact changed files;
- report any generated migration name and confirm whether it was applied anywhere;
- report all tests/checks and exact results;
- report all new server-side environment/configuration keys;
- explicitly state whether Alipay recurring still requires Stripe-account approval/configuration before it can be enabled;
- do not merge, deploy, alter Stripe live settings, configure credentials/prices, run a real payment, or broaden the task.

## Implementation handoff — 2026-10-10

- Stripe WeChat Pay prepaid VIP is implemented; existing AUD card subscriptions are preserved. Each verified successful one-time purchase grants 30 days from `max(now, current VIP expiry)`. Alipay recurring stays unavailable by explicit owner decision.
- Webhook signature verification uses Stripe's raw request body and configured signing secret. WeChat exposure and checkout fail closed unless Stripe API configuration, a nonblank webhook secret, the server-side enable flag, and a valid positive-integer CNY amount are configured. No Stripe account configuration, credentials, CNY price, or live payment was performed.
- No schema/migration change was added or applied. No staging/production database, AWS, or Stripe Dashboard was touched.
- Focused billing tests: 8 files passed, 0 failures, 0 skipped. Changed-file Biome: pass. `git diff --check`: pass.
- Branch is to be created from canonical HEAD `0033c878bd9a3a8f4d16f5f910dd9fa7d1248433`; after push, verify the remote branch HEAD equals the local commit. External review is the next step; do not merge or deploy.
