# CyberSource — step-by-step integration recipe

> Concrete recipe for the patterns in [`integrate-external-services`](../SKILL.md) — adapter (§1),
> **outbound auth via signed JWT** (§3), inbound webhooks (§4), plus card tokenization + 3DS. Node/TS
> examples; steps port to any language. CyberSource's REST auth is their public spec — **verify against
> current CyberSource docs**.

## What you're building
Card payments + tokenization (so you store a token, not a card) + **3-D Secure** (payer auth), via the
CyberSource REST API. Requests are authenticated with a **signed JWT** (RSA key from a P12 cert).

## Prerequisites
- A merchant id + a **P12 certificate** (+ password + key id `kid`) for REST JWT auth.
- (Optional) access/secret/profile keys if you use the Secure Acceptance hosted page instead of Microform.
- All secrets in vault.

## Step 1 — Load the signing key (from the P12 once, cached)
```ts
const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Cert), p12Password);
// extract the PKCS#8 private key → add to a JWK keystore under `kid`
```

## Step 2 — Auth: a signed JWT per request (the distinctive part)
RS256 JWT signed with the P12 key; header carries `v-c-merchant-id` + `kid`; **body carries a SHA-256
digest of the request payload** (so the body is integrity-bound). Send as `Authorization: Bearer <jwt>`.
```ts
const body = payload
  ? { digest: sha256Base64(JSON.stringify(payload)), digestAlgorithm: 'SHA-256', iat: now() }
  : { iat: now() };
const jwt = jose.JWS.createSign({ fields: { alg: 'RS256', 'v-c-merchant-id': merchantId, kid } }, key)
  .update(JSON.stringify(body)).final();
```

## Step 3 — One `callApi` (URL = baseUrl/prefix/version/path)
Prefixes map to product areas — `pts/v2/payments` (payments), `tms/v2/customers` (token mgmt),
`risk/v1` (payer auth), `microform/v2` (session). Map vendor errors → your error (adapter §1).
```ts
const url = `${baseUrl}/${prefix}/${version}${path}`;
const res = await axios.request({ method, url, data: payload, headers: { Authorization: `Bearer ${await signJwt(payload)}` } });
```

## Step 4 — Tokenize the card, then pay (never touch the PAN)
Two options:
- **Microform**: `POST microform/v2/sessions` → session token → the client captures the card in an iframe → you get a **transient token (JWT)**.
- **Secure Acceptance** (hosted): build a form whose `signature` is HMAC-SHA256 over the `signed_field_names` values; the client submits to CyberSource's hosted page.
Then pay with the transient token, creating a reusable instrument:
```ts
await callApi({ prefix: 'pts', version: 'v2', path: '/payments', method: 'POST', payload: {
  clientReferenceInformation: { code: paymentId },               // your id
  processingInformation: { capture: true, actionList: ['TOKEN_CREATE'], actionTokenTypes: ['paymentInstrument','instrumentIdentifier'] },
  tokenInformation: { transientTokenJwt: transientToken },
  orderInformation: { amountDetails: { totalAmount, currency }, billTo: {/*…*/} },
}});
```

## Step 5 — 3-D Secure (payer auth)
`setup → checkEnrollment (device info + returnUrl + challengeWindowSize) → [client completes challenge]
→ getResults`. Then re-send the payment with `processingInformation.actionList:
['VALIDATE_CONSUMER_AUTHENTICATION']` + `consumerAuthenticationInformation.authenticationTransactionId`.
Normalize browser device info (color depth, screen size, language) to the values CyberSource accepts.

## Step 6 — Webhook (Secure Acceptance)
Recompute HMAC-SHA256 over the `signed_field_names` values, base64, compare to the posted `signature`
(pattern §4), then dedupe + map.

## Gotchas
- The **P12 private key** is your most sensitive secret — vault it; never log it.
- The JWT body **digest must match the exact bytes** you send.
- `capture: true` = sale; `false` = auth-only (capture later) — used to add a card without charging (small auth + void).
- 3DS device-info fields are picky — normalize/whitelist them.

## Maps to the pattern
adapter + error mapping → §1 · signed-JWT outbound auth → §3 · transient-token tokenization (PCI-offload) → §1 · webhook verify → §4.
