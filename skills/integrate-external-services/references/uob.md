# UOB PayNow — step-by-step integration recipe

> Concrete recipe for the patterns in [`integrate-external-services`](../SKILL.md) — adapter (§1),
> **outbound auth via mutual TLS + signed JWT** (§3), inbound webhooks with **decrypt + verify** (§4).
> Node/TS examples; steps port to any language. This is a bank API — **verify everything against the
> bank's current integration spec** and test in their sandbox.

## What you're building
**PayNow** QR collection (the payer scans a QR in their banking app) + corporate refund, via the UOB
API. Requests use **mutual TLS** + a **JWS-signed body**; webhooks arrive **encrypted and signed**.

## Prerequisites
- Application-ID, API-Key, Client-ID, Country (header creds).
- An **mTLS client certificate + private key** (for the TLS handshake).
- A **signing private key** (`kid`) for the request JWS, and your RSA key pair for webhook decryption.
- The bank's company/collection account details. All in vault.

## Step 1 — Auth: mutual TLS + a signed request (the distinctive part)
Each call rides an `https.Agent` carrying the **client cert + key** (mTLS), plus header creds, plus an
`Authorization` JWS that signs the request payload:
```ts
const jwt = await signJws(JSON.stringify({ transactionReference: uniqueRef(), account: {/*…*/} }), signingKey);
const res = await axios({ method, url, headers: { 'Application-ID': appId, 'API-Key': apiKey, 'Client-ID': clientId, Country: country, Authorization: jwt.toString() },
  httpsAgent: new https.Agent({ cert, key, rejectUnauthorized: true }) });   // ← mutual TLS
```

## Step 2 — Create a payment = generate a PayNow QR
There's no card. You generate a **single-use EMVCo PayNow QR** for the amount + a short expiry
(~30 min), return it as a base64 image + instructions; the payer scans it in their bank app.
```ts
const qr = await this.paynow.generateBase64QRCode({ transactionRef, expiry, transactionAmount: amount });
return { id: transactionRef, merchant_reference_id: payment.id, expiration: dayjs(expiry).unix(),
  visual_codes: { 'PayNow QR': qr }, status: 'pending' };
```
`transactionRef` is derived from your payment id (e.g. base36) so you can reconcile the webhook later.

## Step 3 — Webhook: decrypt, THEN verify (the distinctive part)
The notification arrives **encrypted + signed**. (1) RSA-decrypt the session key with **your** private
key; (2) AES-GCM-decrypt the payload (IV + auth tag + AAD); (3) fetch the **bank's public key** from
their JWKS endpoint (by `kid`) and verify the signature over the payload. Only then trust it.
```ts
const sessionKey = rsaDecrypt(enc.sessionKey, myPrivateKey);
const payload = aesGcmDecrypt(enc.data, sessionKey, enc.iv, AAD, tagLen);     // decrypt
const pubKey = await fetchBankJwks(enc.kid);
if (!crypto.createVerify(ALG).update(payload).verify(pubKey, sig)) throw new AppError('bad signature'); // verify
// → idempotent (dedupe by notificationId) → map to PAYMENT_COMPLETED
```

## Step 4 — Refund
`POST` the corporate-refund API with originator + original-credit account + amount + the original
transaction date/time; map the response `transactionStatus.code` to your refund-completed/-rejected event.

## Gotchas
- **mTLS**: the client cert/key must be installed and rotated; a handshake failure looks like a generic network error — log enough to tell them apart.
- The QR is **single-use + expiring** — a re-scan after success is a duplicate; warn the user.
- Webhook needs **both** decrypt **and** verify — skipping verify trusts a forgeable payload.
- Reconcile by your `transactionReference`; the bank's id is secondary.

## Maps to the pattern
adapter + error mapping → §1 · mTLS + JWS outbound auth → §3 · webhook decrypt + verify + idempotent + map → §4.
