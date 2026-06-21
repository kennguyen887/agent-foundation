# Stripe — step-by-step integration recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) — adapter (§1), resilient HTTP (§2),
> outbound idempotency (§3), inbound webhooks (§4). Node/TS examples; steps port to any language via
> Stripe's official SDKs. **Verify field names against current Stripe docs.**

## What you're building
Card + wallet payments via **PaymentIntents**, with **webhook-driven** status. Stripe holds the card
data (you stay out of PCI scope): your backend creates an intent, the client confirms it with Stripe,
Stripe reports the final result by webhook.

## Environment variables
```bash
STRIPE_SECRET_KEY=sk_test_...          # Dashboard → Developers → API keys; SERVER-ONLY
STRIPE_PUBLISHABLE_KEY=pk_test_...      # safe to ship to the client
STRIPE_WEBHOOK_SECRET=whsec_...         # per-endpoint signing secret (created when you add the webhook)
STRIPE_API_VERSION=2024-06-20           # pin it
```

## Setup & connect
1. Create a Stripe account; stay in **test mode**. Dashboard → **Developers → API keys** → copy the **secret** + **publishable** keys.
2. Install the official SDK: `npm i stripe`.
3. **Add a webhook endpoint** (Dashboard → Developers → Webhooks) at `https://api.example.com/webhooks/stripe`, select the events you handle, and copy its **signing secret** → `STRIPE_WEBHOOK_SECRET`.
4. Scope `express.raw` to the webhook path **before** the JSON body parser (Step 3).
5. Wire a `StripeGateway` provider (adapter §1) with the pinned API version.
```ts
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: process.env.STRIPE_API_VERSION });
```

## Step 1 — Adapter impl (behind your `PaymentGateway` interface — §1)
```ts
const intent = await stripe.paymentIntents.create(
  { amount: amountMinor, currency, customer, metadata: { orderId }, automatic_payment_methods: { enabled: true } },
  { idempotencyKey: orderId },          // §3: safe to retry after a timeout
);
return { providerRef: intent.id, clientSecret: intent.client_secret, status: map(intent.status) };
```
Return `client_secret` to the client; it confirms with Stripe.js / the mobile SDK. **You never receive raw card data.** Map Stripe errors → your typed error.

## Step 2 — Webhook (the part people get wrong)
```ts
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));   // raw bytes, BEFORE global json parse

@Post('/webhooks/stripe') @HttpCode(200)
handle(@Req() req: RawBodyRequest, @Headers('stripe-signature') sig: string) {
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET); }
  catch { throw new BadRequestError('bad signature'); }
  return this.commandBus.execute(new EnqueueWebhookCommand(event));   // ack fast, process in a worker
}
```
Dedupe by `event.id`; map `event.type` → your internal event (`payment_intent.succeeded` → settled, …).

## Step 3 — Wallets + test
Apple/Google Pay ride the same PaymentIntent (`automatic_payment_methods`); Apple Pay needs **domain
registration** (Dashboard → Payment method domains). Test cards: `4242 4242 4242 4242` (ok),
`4000 0027 6000 3184` (3DS). Replay webhooks: `stripe listen --forward-to localhost:3000/webhooks/stripe`.

## Gotchas
- **Raw body** must reach `constructEvent` — scope `express.raw` to the webhook path only.
- **Webhook secret is per-endpoint** — staging and prod differ.
- **Amounts are integer minor units** (cents); do money math with a decimal lib upstream.
- **PaymentIntent status is the source of truth** (via webhook) — not the client `confirm()` return.
- **Pin `STRIPE_API_VERSION`**; bump deliberately.

## Maps to the pattern
adapter + error mapping → §1 · resilient client → §2 · idempotency key → §3 · raw-body + verify + idempotent + event-map → §4.
