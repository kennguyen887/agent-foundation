# Stripe — step-by-step integration recipe

> A concrete recipe for the patterns in [`integrate-external-services`](../SKILL.md) — adapter (§1),
> resilient HTTP (§2), outbound idempotency (§3), inbound webhooks (§4). Backend-focused; Node/NestJS
> examples, but the **steps** port to any language via Stripe's official SDKs. Treat the API fields as
> *the shape*, not a frozen reference — **verify against current Stripe docs** before shipping.

## What you're building
Card + wallet payments via **PaymentIntents**, with **webhook-driven** status updates. Stripe holds the
card data (you stay out of PCI scope): your backend creates an intent, the client confirms it with
Stripe directly, and Stripe tells you the final result via webhook.

## Prerequisites
- A Stripe account. Dashboard → Developers → API keys: a **publishable key** (ships to the client) + a
  **secret key** (server only). Use **test-mode** keys first.
- A **webhook signing secret** (one per endpoint), created when you register the webhook endpoint.
- Store secret key + webhook secret in your vault/config (server-only).

## Step 1 — Config (secret stays server-side, pin the API version)
```ts
// STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET from vault/config (never the client)
const stripe = new Stripe(cfg.stripeSecretKey, { apiVersion: '2024-06-20' });
```
Pin `apiVersion` so a Stripe upgrade doesn't change payload shapes under you; bump it deliberately.

## Step 2 — Adapter impl (behind your `PaymentGateway` interface — pattern §1)
Map your DTOs → Stripe, and Stripe errors → your typed errors:
```ts
@Injectable() export class StripeGateway implements PaymentGateway {
  getProvider() { return ProviderType.STRIPE; }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    try {
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: input.amountMinor,                 // integer MINOR units (cents) — not floats
          currency: input.currency,
          customer: input.providerCustomerId,
          metadata: { orderId: input.orderId },      // your id → reconciliation later
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: input.orderId },            // pattern §3: safe to retry after a timeout
      );
      return { providerRef: intent.id, clientSecret: intent.client_secret, status: map(intent.status) };
    } catch (e) { throw toAppError(e); }              // vendor error → your error model
  }
  // refund(), createOrGetCustomer(), … same shape
}
```
Return `client_secret` to the client; it confirms with Stripe.js / the mobile SDK. **You never receive raw card data.**

## Step 3 — Webhook endpoint (the part people get wrong)
1. Register the endpoint in Dashboard → Developers → Webhooks (e.g. `https://api.example.com/webhooks/stripe`); copy its **signing secret**.
2. Capture the **raw body** for that route **before** JSON parsing (pattern §4):
   ```ts
   app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));   // raw bytes only on this path
   ```
3. Verify the signature with the SDK, then **fast-ack + enqueue** (don't process inline):
   ```ts
   @Post('/webhooks/stripe') @HttpCode(200)
   handle(@Req() req: RawBodyRequest, @Headers('stripe-signature') sig: string) {
     let event: Stripe.Event;
     try { event = this.stripe.webhooks.constructEvent(req.rawBody, sig, cfg.webhookSecret); }
     catch { throw new BadRequestError('bad signature'); }      // reject spoofed/garbled
     return this.commandBus.execute(new EnqueueWebhookCommand(event));   // ack fast, process in a worker
   }
   ```
4. **Idempotency**: dedupe by `event.id` (Stripe redelivers). **Map** `event.type` → your internal event:
   ```ts
   const MAP = new Map([
     ['payment_intent.succeeded',      EVT.PAYMENT_SETTLED],
     ['payment_intent.payment_failed', EVT.PAYMENT_FAILED],
     ['charge.refunded',               EVT.REFUNDED],
   ]);
   ```

## Step 4 — Wallets (Apple Pay / Google Pay)
Both ride on the **same PaymentIntent** (`automatic_payment_methods` or `payment_method_types: ['card']`).
Apple Pay needs **domain registration** (Dashboard → Payment method domains); with Stripe's
PaymentRequest button Stripe runs the merchant-validation handshake for you (pattern §1 wallet bullet).

## Step 5 — Test it
- Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 9995` (declined),
  `4000 0027 6000 3184` (3DS required).
- Replay webhooks locally with the Stripe CLI:
  ```bash
  stripe listen --forward-to localhost:3000/webhooks/stripe
  stripe trigger payment_intent.succeeded
  ```

## Gotchas
- **Raw body**: if the global JSON parser runs first, `constructEvent` fails — scope `express.raw` to the webhook path only.
- **Webhook secret is per-endpoint** — staging and prod have different secrets; don't share them.
- **Amounts are integer minor units** (cents); do money math with a decimal lib upstream (`write-service-code` §5).
- **PaymentIntent status is the source of truth**, delivered by webhook — don't treat the client `confirm()` return as final.
- **3DS / SCA**: a `requires_action` status means the client must complete authentication — handle it, don't treat it as failure.
- **Pin `apiVersion`** and test version bumps; don't let Stripe silently change payloads.

## Maps back to the pattern
adapter + error mapping → §1 · resilient client → §2 · idempotency key → §3 · raw-body + verify + idempotent + fast-ack + event-map → §4.
