# China VIP payment configuration

China payment options use the existing Stripe billing boundary. Configuration
is server-side only; request bodies and browser return parameters never supply
prices, currency, payment duration, user identity, or entitlement state.

## WeChat Pay prepaid VIP

After WeChat Pay is enabled for the Stripe account, set
`VIP_WECHAT_PAY_ENABLED=true` and set `VIP_WECHAT_CNY_30_DAY_AMOUNT_MINOR` to the
business-approved CNY amount in minor units (fen), as a positive base-10
integer. The application does not provide a default price or convert from AUD.
Both settings are required; missing or invalid configuration keeps the option
unavailable. Checkout uses Stripe's one-time `payment` mode with only
`wechat_pay`; a verified Stripe payment adds 30 days and does not renew
automatically.

The existing `STRIPE_WEBHOOK_SECRET` must also be configured. VIP status and
checkout remain unavailable without it so the application cannot accept a
payment that it cannot verify and settle.

The Stripe webhook endpoint must deliver `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, and
`checkout.session.async_payment_failed` events to the existing VIP webhook.
Entitlement is activated only after signature verification and exact local
purchase, payment-method, CNY amount, and metadata checks. Repeated events for
one Checkout Session settle the same `VipPurchase` at most once.

## Alipay recurring VIP

Alipay recurring is not enabled. Stripe currently documents recurring Alipay
as private preview and says Alipay is unsupported in Checkout subscription
mode. The live Stripe account has not received approval. The UI and checkout
route therefore fail closed; no CNY monthly Alipay price key or enable switch
is provided until Stripe grants access and supplies the supported
subscription-authorization flow. Do not enable Alipay by setting an ad hoc
environment variable or substituting a one-time payment.

## Existing AUD card subscription

The administrator-managed AUD monthly price and existing Stripe recurring
checkout remain unchanged. The CNY configuration above does not alter AUD
pricing.
