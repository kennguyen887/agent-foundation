# CyberSource — step-by-step integration recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) — adapter (§1), **outbound auth via
> signed JWT** (§3), webhooks (§4), plus card tokenization + 3-D Secure. Node/TS examples; verify against
> current CyberSource docs.

## What you're building
Card payments + tokenization (store a token, not a card) + **3-D Secure** (payer auth), via the
CyberSource REST API. Requests are authenticated with a **signed JWT** (RSA key from a P12 cert).

## Environment variables
```bash
CYBERSOURCE_BASE_URL=https://apitest.cybersource.com    # test; prod = https://api.cybersource.com
CYBERSOURCE_MERCHANT_ID=
CYBERSOURCE_P12_CERTIFICATE_BASE64=                      # the REST .p12 cert, base64-encoded (JWT signing key)
CYBERSOURCE_P12_PASSWORD=
CYBERSOURCE_P12_KID=                                     # key id (serial) of the cert
# Hosted card capture (Secure Acceptance / Microform):
CYBERSOURCE_ACCESS_KEY=
CYBERSOURCE_SECRET_KEY=
CYBERSOURCE_PROFILE_ID=
CYBERSOURCE_HOSTED_CHECKOUT_BASE_URL=
CYBERSOURCE_MICROFORM_TARGET_ORIGIN=https://app.example.com   # your web origin (CORS for the iframe)
CYBERSOURCE_PAYER_AUTH_RETURN_URL=https://api.example.com/payments/3ds-return
```

## Setup & connect
1. Get a CyberSource account (Enterprise Business Center). Under **Key Management**, create a **REST
   shared secret / P12 certificate** for JWT auth; note its **KID**. Base64-encode the `.p12` →
   `CYBERSOURCE_P12_CERTIFICATE_BASE64`; store the password.
2. For card capture, create a **Secure Acceptance** profile (profile id + access/secret) and/or enable
   **Flex Microform**; set the target origin to your web app.
3. Install `node-jose` (sign the JWT) + `node-forge` (read the P12) + `crypto`.
4. On boot, decode the P12 → load the private key into a keystore keyed by `CYBERSOURCE_P12_KID`.
5. Configure `CYBERSOURCE_PAYER_AUTH_RETURN_URL` for the 3-D Secure browser return.
6. Wire a `CybersourceGateway` provider (adapter §1).

## Step 1 — Auth: a signed JWT per request (the distinctive part)
RS256 JWT signed with the P12 key; header carries `v-c-merchant-id` + `kid`; **body carries a SHA-256
digest of the request payload** (so the body is integrity-bound). Send as `Authorization: Bearer <jwt>`.
```ts
const body = payload
  ? { digest: sha256Base64(JSON.stringify(payload)), digestAlgorithm: 'SHA-256', iat: now() }
  : { iat: now() };
const jwt = jose.JWS.createSign({ fields: { alg: 'RS256', 'v-c-merchant-id': merchantId, kid } }, key)
  .update(JSON.stringify(body)).final();
```

## Step 2 — One `callApi` (URL = baseUrl/prefix/version/path)
Prefixes map to product areas — `pts/v2/payments`, `tms/v2/customers` (token mgmt), `risk/v1` (payer
auth), `microform/v2`. Map vendor errors → your error (adapter §1).
```ts
const url = `${CYBERSOURCE_BASE_URL}/${prefix}/${version}${path}`;
const res = await axios.request({ method, url, data: payload, headers: { Authorization: `Bearer ${await signJwt(payload)}` } });
```

## Step 3 — Tokenize the card, then pay (never touch the PAN)
- **Microform**: `POST microform/v2/sessions` → session token → client captures the card in an iframe → you receive a **transient token (JWT)**; or
- **Secure Acceptance** (hosted): build a form whose `signature` is HMAC-SHA256 over the `signed_field_names` values.
Then pay with the transient token, creating a reusable instrument (`actionList: ['TOKEN_CREATE']`,
`tokenInformation.transientTokenJwt`, `processingInformation.capture: true`).

## Step 4 — 3-D Secure (payer auth)
`setup → checkEnrollment (device info + returnUrl) → [client challenge] → getResults`, then re-send the
payment with `actionList: ['VALIDATE_CONSUMER_AUTHENTICATION']` + `authenticationTransactionId`. Normalize
browser device-info fields to the values CyberSource accepts.

## Step 5 — Webhook (Secure Acceptance)
Recompute HMAC-SHA256 over the `signed_field_names` values → base64, compare to the posted `signature`
(pattern §4), then dedupe + map.

## Gotchas
- The **P12 private key** is your most sensitive secret — vault it, never log it.
- The JWT body **digest must match the exact bytes** you send.
- `capture: true` = sale; `false` = auth-only (used to add a card: small auth + void).
- 3-D Secure device-info fields are picky — normalize/whitelist them.

## Maps to the pattern
adapter + error mapping → §1 · signed-JWT outbound auth → §3 · transient-token tokenization (PCI-offload) → §1 · webhook verify → §4.
