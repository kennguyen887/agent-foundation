# UOB PayNow — step-by-step integration recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) — adapter (§1), **outbound auth via
> mutual TLS + signed JWT** (§3), webhooks with **decrypt + verify** (§4). Node/TS examples. This is a
> bank API — **verify everything against the bank's current spec** and test in their sandbox.

## What you're building
**PayNow** QR collection (the payer scans a QR in their banking app) + corporate refund. Requests use
**mutual TLS** + a **JWS-signed body**; webhooks arrive **encrypted and signed**.

## Environment variables
```bash
UOB_BASE_URL=
UOB_APPLICATION_ID=
UOB_API_KEY=
UOB_CLIENT_ID=
UOB_COUNTRY=SG
UOB_ACCOUNT_NUMBER=                              # your collection account
UOB_ACCOUNT_CURRENCY=SGD
UOB_ACCOUNT_TYPE=
UOB_PRIVATE_KEY_BASE64=                          # JWS request-signing private key (base64 PEM)
UOB_PRIVATE_KEY_PASSPHRASE=
UOB_SSL_INTEGRATION_CERTIFICATE_BASE64=          # mTLS client certificate
UOB_SSL_INTEGRATION_PRIVATE_KEY_BASE64=          # mTLS client private key
UOB_SSL_INTEGRATION_PRIVATE_KEY_PASSPHRASE=
UOB_IV_SIZE=12                                   # AES-GCM IV size (webhook decrypt)
UOB_TAG_LENGTH=128                               # AES-GCM auth-tag length in bits
UOB_ALGO_TRANSFORMATION_STRING=aes-256-gcm
UOB_AAD_DATA=                                    # AES-GCM additional authenticated data
PAYNOW_EXPIRATION_TIME_IN_MINUTES=30             # QR single-use validity
```

## Setup & connect
1. **Onboard with the bank** (commercial contract). Receive `Application-ID`, `API-Key`, `Client-ID`, the API base URL, and your **collection account** details.
2. **Exchange keys/certs**: give the bank your **mTLS client cert** + your **JWS signing public key**; the bank gives you their endpoint + a **JWKS** URL (for verifying webhook signatures) and the AES-GCM params (`IV_SIZE`, `TAG_LENGTH`, `AAD`).
3. Base64-encode and vault all certs/keys; install `node-forge` + `node-jose` + node `https` + `crypto`.
4. **Register your notification (webhook) URL** with the bank.
5. Wire a `UobGateway`; load the mTLS cert/key + signing key into a keystore on boot.

## Step 1 — Auth: mutual TLS + a signed request (the distinctive part)
Each call rides an `https.Agent` carrying the **client cert + key** (mTLS), plus header creds, plus an
`Authorization` JWS that signs the request payload:
```ts
const jwt = await signJws(JSON.stringify({ transactionReference: uniqueRef(), account: {/*…*/} }), signingKey);
const res = await axios({ method, url, headers: { 'Application-ID': appId, 'API-Key': apiKey, 'Client-ID': clientId, Country: country, Authorization: jwt.toString() },
  httpsAgent: new https.Agent({ cert, key, rejectUnauthorized: true }) });   // ← mutual TLS
```

## Step 2 — Create a payment = generate a PayNow QR
No card. Generate a **single-use EMVCo PayNow QR** for the amount + a short expiry
(`PAYNOW_EXPIRATION_TIME_IN_MINUTES`), return it as a base64 image; the payer scans it in their bank app.
`transactionReference` is derived from your payment id (e.g. base36) so you can reconcile the webhook.

## Step 3 — Webhook: decrypt, THEN verify (the distinctive part)
The notification arrives **encrypted + signed**: (1) RSA-decrypt the session key with **your** private
key; (2) AES-GCM-decrypt the payload (IV + auth tag + `UOB_AAD_DATA`); (3) fetch the **bank's public key**
from their JWKS (by `kid`) and verify the signature over the payload. Only then trust it → idempotent
(dedupe by `notificationId`) → map to PAYMENT_COMPLETED.

## Step 4 — Refund
`POST` the corporate-refund API with originator + original-credit account + amount + the original
transaction date/time; map `transactionStatus.code` to your refund-completed/-rejected event.

## Gotchas
- **mTLS**: cert/key must be installed and rotated; a handshake failure looks like a generic network error — log enough to distinguish it.
- The QR is **single-use + expiring** — a re-scan after success is a duplicate; warn the user.
- Webhook needs **both** decrypt **and** verify — skipping verify trusts a forgeable payload.
- Reconcile by your `transactionReference`; the bank's id is secondary.

## Maps to the pattern
adapter + error mapping → §1 · mTLS + JWS outbound auth → §3 · webhook decrypt + verify + idempotent + map → §4.
