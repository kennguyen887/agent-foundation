# Wallet payments (Apple Pay / Google Pay / WeChat Pay / Alipay) — recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) §1 (adapter + **method→gateway
> routing**) and §4 (webhook). Wallets aren't a *gateway* — they're a **payment method** that a gateway
> processes. Node/TS examples; verify the wallet + gateway specifics against current docs.

## What you're building
Let users pay with a device/wallet button. The wallet returns an **opaque payment token**; your backend
forwards it to whichever **gateway** processes that wallet — you **never touch card data** (the wallet +
gateway own PCI scope).

## Step 1 — A method→gateway routing factory
A method only works on certain gateways, so map **payment-method type → gateway**, with precedence
**feature-flag > env > default** (so you can shift a method between gateways without a deploy):
```ts
static gatewayFor(method: PaymentMethodType, cfg): GatewayType {
  switch (method) {
    case APPLE_PAY:
    case GOOGLE_PAY:  return GatewayType.CYBERSOURCE;             // wallets → a gateway that accepts them
    case WECHAT_PAY:
    case ALIPAY:      return GatewayType.STRIPE;
    case CARD:        return cfg.cardFlag ?? cfg.cardEnv ?? GatewayType.RAPYD;     // flag > env > default
    case PAY_NOW:     return cfg.payNowFlag ?? cfg.payNowEnv ?? GatewayType.RAPYD;
    default:          throw new AppError('unsupported method');
  }
}
```

## Step 2 — The token flow (you stay out of PCI scope)
1. **Client** uses the wallet SDK (Apple Pay JS / Google Pay API) to authorize → gets an **opaque
   payment token** (Apple `PKPaymentToken`, Google Pay encrypted token).
2. Client sends that token to **your** backend.
3. Backend forwards the token to the routed gateway as the payment instrument (e.g. CyberSource
   `tokenInformation`) and creates the payment — exactly like the gateway's normal create-payment
   (see `cybersource.md` / `stripe.md`).
You never receive a PAN; **don't log the token**.

## Step 3 — Apple Pay merchant validation (web only)
For Apple Pay on the **web**, the browser asks your server to start a session: your endpoint calls
Apple's validation URL **with your Apple merchant certificate** and returns the session object to the
client. (Native iOS and Google Pay don't need this server step; Google Pay relies on gateway
tokenization.)
```ts
@Post('/apple-pay/validate-merchant')
validate(@Body() { validationUrl }) {
  return this.appleClient.post(validationUrl, { merchantIdentifier, displayName, initiative: 'web', initiativeContext: domain });
}
```
Register your domain in the Apple Pay / gateway dashboard first.

## Step 4 — Result by webhook
Settlement/refund results come back through the **gateway's** webhook — verify + dedupe + map exactly
as in that gateway's recipe (pattern §4). The wallet itself sends nothing async.

## Gotchas
- **Domain registration** (Apple) + a **merchant cert** are prerequisites — wallets fail silently if missing.
- Wallet tokens are **single-use + short-lived** — forward immediately, never store or log.
- Routing is config-driven (flag > env) — don't hard-code one gateway per method in business code.
- Currency/amount rules still apply (integer minor units; decimal lib upstream).

## Maps to the pattern
method→gateway factory + wallet bullet → §1 · token forwarded to the gateway adapter → §1 · result → gateway webhook §4.
