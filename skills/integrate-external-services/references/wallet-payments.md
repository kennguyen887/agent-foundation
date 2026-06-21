# Wallet payments (Apple Pay / Google Pay / WeChat Pay / Alipay) — recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) §1 (adapter + **method→gateway
> routing**) and §4 (webhook). Wallets aren't a *gateway* — they're a **payment method** a gateway
> processes. Node/TS; verify wallet + gateway specifics against current docs.

## What you're building
Let users pay with a device/wallet button. The wallet returns an **opaque payment token**; your backend
forwards it to whichever **gateway** processes that wallet — you **never touch card data**.

## Environment variables
```bash
# method → gateway routing (env is the default; a feature flag may override at runtime)
PAYMENT_GATEWAY_PROVIDER_APPLE_PAY=cybersource
PAYMENT_GATEWAY_PROVIDER_GOOGLE_PAY=cybersource
PAYMENT_GATEWAY_PROVIDER_CARD=rapyd
PAYMENT_GATEWAY_PROVIDER_PAYNOW=rapyd
# Apple Pay on the WEB (merchant validation):
APPLE_PAY_MERCHANT_ID=merchant.com.example
APPLE_PAY_MERCHANT_CERT_BASE64=          # Apple Pay merchant identity cert (+ key), base64
APPLE_PAY_MERCHANT_CERT_PASSWORD=
APPLE_PAY_DOMAIN=app.example.com
# plus the env of the routed gateway (see cybersource.md / stripe.md)
```

## Setup & connect
1. Decide the routing: which gateway processes each wallet → set the `PAYMENT_GATEWAY_PROVIDER_*` envs (the factory reads them; a feature flag can override per rollout).
2. **Apple Pay (web)**: register `APPLE_PAY_DOMAIN` in the Apple Developer portal **and** your gateway dashboard; download the **merchant identity certificate** → `APPLE_PAY_MERCHANT_CERT_BASE64`.
3. **Google Pay**: register the merchant in the Google Pay console; no server-side merchant validation (the gateway tokenizes).
4. Configure the underlying gateway (CyberSource/Stripe) per its own recipe.
5. Client side (FE) integrates the Apple Pay JS / Google Pay API button — the FE obtains the token and posts it to your backend.

## Step 1 — A method→gateway routing factory
```ts
static gatewayFor(method: PaymentMethodType, cfg): GatewayType {
  switch (method) {
    case APPLE_PAY:
    case GOOGLE_PAY:  return cfg.applePayFlag ?? GatewayType.CYBERSOURCE;     // wallets → a gateway that accepts them
    case WECHAT_PAY:
    case ALIPAY:      return GatewayType.STRIPE;
    case CARD:        return cfg.cardFlag ?? cfg.cardEnv ?? GatewayType.RAPYD; // flag > env > default
    case PAY_NOW:     return cfg.payNowFlag ?? cfg.payNowEnv ?? GatewayType.RAPYD;
    default:          throw new AppError('unsupported method');
  }
}
```

## Step 2 — The token flow (you stay out of PCI scope)
1. **Client** authorizes via the wallet SDK → gets an **opaque payment token** (Apple `PKPaymentToken`, Google Pay token).
2. Client posts the token to **your** backend.
3. Backend forwards it to the routed gateway as the payment instrument and creates the payment — like the gateway's normal create-payment (see `cybersource.md` / `stripe.md`). **Don't log the token.**

## Step 3 — Apple Pay merchant validation (web only)
```ts
@Post('/apple-pay/validate-merchant')
validate(@Body() { validationUrl }) {                          // the browser supplies validationUrl
  return this.appleClient.post(validationUrl,                  // call it WITH the merchant cert (mTLS)
    { merchantIdentifier: process.env.APPLE_PAY_MERCHANT_ID, displayName, initiative: 'web', initiativeContext: process.env.APPLE_PAY_DOMAIN });
}
```
Native iOS and Google Pay don't need this server step.

## Step 4 — Result by webhook
Settlement/refund comes back through the **gateway's** webhook — verify + dedupe + map per that
gateway's recipe (§4). The wallet itself sends nothing async.

## Gotchas
- **Domain registration** (Apple) + a **merchant cert** are prerequisites — wallets fail silently if missing.
- Wallet tokens are **single-use + short-lived** — forward immediately, never store or log.
- Routing is **config-driven** (flag > env > default) — don't hard-code one gateway per method.

## Maps to the pattern
method→gateway factory + wallet bullet → §1 · token forwarded to the gateway adapter → §1 · result → gateway webhook §4.
