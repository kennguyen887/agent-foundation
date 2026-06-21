# Rapyd — step-by-step integration recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) — adapter (§1), resilient HTTP (§2),
> **outbound HMAC signing** (§3), inbound webhooks (§4). Node/TS examples; steps port to any language.
> The signing scheme is Rapyd's public spec — **verify against current Rapyd docs** before shipping.

## What you're building
Card + PayNow collection via **Rapyd Collect**. Every request is **HMAC-signed**; cards are tokenized on
Rapyd's **hosted page** (you never see the PAN); the result arrives by **webhook**.

## Environment variables
```bash
RAPYD_BASE_URL=https://sandboxapi.rapyd.net      # sandbox; prod = https://api.rapyd.net
RAPYD_ACCESS_KEY=                                 # Dashboard → Developers → Credentials
RAPYD_SECRET_KEY=                                 # SERVER-ONLY — never ship to a client
RAPYD_WEBHOOK_URL=https://api.example.com/webhooks/rapyd   # the EXACT URL you register (it's part of the webhook HMAC)
```

## Setup & connect
1. Create a Rapyd account; use **sandbox** first. Dashboard → **Developers → Credentials** → copy the **access key** + **secret key** into the vault.
2. Rapyd has **no official Node SDK** — install `axios` + `crypto-js` and sign requests yourself (Step 2).
3. **Register the webhook** (Dashboard → Developers → Webhooks) at exactly `RAPYD_WEBHOOK_URL`; the URL string is hashed into the webhook signature, so it must match byte-for-byte.
4. Wire a `RapydGateway` provider behind your `PaymentGateway` interface (adapter §1), injecting the config above.

## Step 1 — Sign every request (the distinctive part)
HMAC-SHA256 over `method + path + salt + timestamp + accessKey + secretKey + body`, hex → base64; fresh
random salt; timestamp in **seconds** with a small backward skew; send as headers.
```ts
private signHeaders(method: string, path: string, body: object) {
  const timestamp = String(Math.floor(Date.now() / 1000) - 10);   // small skew buffer
  const salt = CryptoJS.lib.WordArray.random(12).toString();
  const bodyStr = JSON.stringify(body) === '{}' ? '' : JSON.stringify(body);
  const toSign = `${method.toLowerCase()}${path}${salt}${timestamp}${accessKey}${secretKey}${bodyStr}`;
  const signature = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(CryptoJS.enc.Hex.stringify(CryptoJS.HmacSHA256(toSign, secretKey))));
  return { access_key: accessKey, salt, timestamp, signature };
}
```

## Step 2 — One signed `callApi` wrapper (adapter §1, error mapping)
```ts
async callApi(method: Method, path: string, body: object = {}) {
  const url = `${RAPYD_BASE_URL}/v1${path}`;
  try {
    return await axios({ method, url, data: body, headers: this.signHeaders(method, `/v1${path}`, body) });
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) throw new AppError(JSON.stringify(e.response.data)); // vendor error → yours
    throw new AppError('Rapyd call failed');
  }
}
```

## Step 3 — Create a payment
```ts
await this.callApi('post', '/payments', {
  amount, currency, customer,                 // customer = Rapyd customer id (from POST /customers)
  payment_method: methodData,
  expiration: dayjs().add(15, 'minute').unix(),
  merchant_reference_id: payment.id,          // YOUR id — the reconciliation key
});
```
Cards: `POST /customers`, then **hosted tokenization** (`POST /hosted/collect/card` → a `redirect_url` the user completes); list saved methods via `GET /customers/:id/payment_methods`.

## Step 4 — Webhook
Verify the HMAC over `RAPYD_WEBHOOK_URL + salt + timestamp + accessKey + secretKey + JSON.stringify(body)`
against the request's `signature` header (pattern §4), then dedupe by event id + map the event.

## Gotchas
- The signed string must match **byte-for-byte** — same salt/timestamp/body serialization; an empty body signs as `''`, not `'{}'`.
- `RAPYD_WEBHOOK_URL` must equal the registered URL exactly (it's hashed in).
- `merchant_reference_id` is **your** payment id — reconcile the webhook back to your record by it.
- Cards are PCI-offloaded to the hosted page — never post raw card numbers to your API.
- Refunds may be disabled for your account — confirm before relying on them.

## Maps to the pattern
adapter + error mapping → §1 · resilient `callApi` → §2 · HMAC signing → §3 · webhook verify + idempotent + map → §4.
