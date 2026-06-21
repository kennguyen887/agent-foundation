# Rapyd — step-by-step integration recipe

> Concrete recipe for the patterns in [`integrate-external-services`](../SKILL.md) — adapter (§1),
> resilient HTTP (§2), **outbound HMAC signing** (§3), inbound webhooks (§4). Node/TS examples; the
> steps port to any language. The signing scheme is Rapyd's public spec — **verify against current
> Rapyd docs** before shipping.

## What you're building
Card + PayNow collection via **Rapyd Collect**. Every request is **HMAC-signed**; cards are tokenized
through Rapyd's **hosted page** (you never see the PAN); the final result arrives by **webhook**.

## Prerequisites
- Rapyd **access key** + **secret key** (Dashboard → Developers). Sandbox first.
- A webhook URL registered in the dashboard.
- Keys in vault/config (server-only).

## Step 1 — Config
```ts
// RAPYD_BASE_URL, RAPYD_ACCESS_KEY, RAPYD_SECRET_KEY from vault
```

## Step 2 — Sign every request (the distinctive part)
HMAC-SHA256 over `method + path + salt + timestamp + accessKey + secretKey + body`, hex → base64;
fresh random salt; timestamp in **seconds** with a small backward skew; attach as headers.
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

## Step 3 — One signed `callApi` wrapper (adapter §1, error mapping)
```ts
async callApi(method: Method, path: string, body: object = {}) {
  const url = `${baseUrl}/v1${path}`;
  try {
    return await axios({ method, url, data: body, headers: this.signHeaders(method, `/v1${path}`, body) });
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) throw new AppError(JSON.stringify(e.response.data)); // vendor error → yours
    throw new AppError('Rapyd call failed');
  }
}
```

## Step 4 — Create a payment
```ts
await this.callApi('post', '/payments', {
  amount, currency, customer,                 // customer = Rapyd customer id (from /customers)
  payment_method: methodData,                 // built per method type
  expiration: dayjs().add(15, 'minute').unix(),
  merchant_reference_id: payment.id,          // YOUR id — the reconciliation key
});
```
Cards: create a customer (`POST /customers`), then **hosted card tokenization** (`POST /hosted/collect/card` → a `redirect_url` the user completes); list saved methods via `GET /customers/:id/payment_methods`.

## Step 5 — Webhook
Register the URL in the dashboard. Verify the HMAC over `webhookUrl + salt + timestamp + accessKey +
secretKey + JSON.stringify(body)` against the request's `signature` header (pattern §4), then dedupe by
event id + map the event:
```ts
const toSign = webhookUrl + h.salt + h.timestamp + accessKey + secretKey + JSON.stringify(body);
if (sign(toSign) !== h.signature) throw new AppError('bad signature');
```

## Gotchas
- The signed string must match **byte-for-byte** — same salt/timestamp/body serialization you sent; an empty body signs as `''`, not `'{}'`.
- `merchant_reference_id` is **your** payment id — use it to reconcile the webhook back to your record.
- Cards are PCI-offloaded to the hosted page — **never** post raw card numbers to your API.
- Refunds may be disabled for your account — confirm capability before relying on them.

## Maps to the pattern
adapter + error mapping → §1 · resilient `callApi` → §2 · HMAC signing → §3 · webhook verify + idempotent + map → §4.
