# Singpass (NDI OIDC) — step-by-step integration recipe

> Concrete recipe for [`integrate-identity-providers`](../SKILL.md) — the OIDC relying-party flow (§1),
> token validation (§2), KYC verified attributes (§5). **⚠️ This is written from the public Singpass
> NDI OIDC shape, not from repo code — verify every endpoint, algorithm, and scope against the current
> Singpass developer portal before shipping.** The *pattern* (private-key-JWT + JWE) is stable; the
> exact fields change.

## What you're building
"Log in with Singpass" + retrieve **government-verified attributes** (Myinfo) as a **relying party**.
Singpass is OIDC, but with two non-obvious requirements: the client authenticates with a
**private-key JWT** (no shared secret), and the **ID token is encrypted (JWE)** — you decrypt it, then
verify its signature.

## Environment variables
```bash
SINGPASS_ISSUER=https://stg-id.singpass.gov.sg      # sandbox; prod = https://id.singpass.gov.sg
SINGPASS_CLIENT_ID=
SINGPASS_REDIRECT_URI=https://app.example.com/auth/singpass/callback
SINGPASS_SCOPES=openid                               # + Myinfo attribute scopes (e.g. name, uinfin, dob)
SINGPASS_SIG_PRIVATE_KEY_BASE64=                     # YOUR signing key — signs the client_assertion
SINGPASS_ENC_PRIVATE_KEY_BASE64=                     # YOUR encryption key — decrypts the JWE ID token
SINGPASS_JWKS_URI=https://app.example.com/.well-known/jwks.json   # YOU host this (your public sig+enc keys)
```

## Setup & connect
1. Register on the **Singpass developer portal**; create an app; register the **redirect URI** + the
   **Myinfo scopes** you need; note the **client_id**. Use the **sandbox** first.
2. Generate **two key pairs** (a signing key + an encryption key) using Singpass's required algorithms,
   and **host your public keys as a JWKS** at `SINGPASS_JWKS_URI` — Singpass fetches it to verify your
   `client_assertion` and to **encrypt the ID token to you**.
3. Vault your private keys; install a JOSE lib (`jose`) for JWS/JWE.
4. The **frontend** drives the redirect/callback UI; the **token exchange + JWE decrypt + verification
   happen on the backend** (this recipe).

## Step 1 — Authorize redirect (auth code + PKCE)
```
GET ${SINGPASS_ISSUER}/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}
   &scope=openid&state=...&nonce=...&code_challenge=...&code_challenge_method=S256
```
Keep `state` / `nonce` / `code_verifier` server-side.

## Step 2 — Token exchange with a private-key JWT (not a secret)
```ts
const clientAssertion = await signJws(                     // signed with YOUR signing key
  { iss: CLIENT_ID, sub: CLIENT_ID, aud: SINGPASS_ISSUER, exp, jti }, sigKey);
const res = await http.post(tokenEndpoint, new URLSearchParams({
  grant_type: 'authorization_code', code, code_verifier, redirect_uri: REDIRECT_URI,
  client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
  client_assertion: clientAssertion,
}));
```

## Step 3 — ID token: DECRYPT (JWE) then VERIFY (JWS) — the key gotcha
```ts
const jws = await jwtDecrypt(res.id_token, encPrivateKey);          // your private encryption key
const { payload } = await jwtVerify(jws, singpassJwks, {            // Singpass's published JWKS
  issuer: SINGPASS_ISSUER, audience: CLIENT_ID });
assert(payload.nonce === expectedNonce);
const sub = payload.sub;                                            // pseudonymous user id
```

## Step 4 — Fetch verified attributes (Myinfo) → treat as KYC
Call the userinfo / Myinfo Person endpoint with the access token; the response is typically **signed +
encrypted** the same way (decrypt → verify). Store returned attributes (name, UINFIN/FIN, DOB) as
**verified**: `{ verified: true, source: 'singpass', verifiedAt }`; **don't let the user edit verified
fields** (this is stronger than social login — see `integrate-identity-providers` §5).

## Step 5 — Map to your user
Link by `(provider: 'singpass', subject: sub)`, not by NRIC/email; provision on first login.

## Gotchas
- **JWE decryption is the #1 gotcha** — the ID token (and Myinfo payload) is encrypted to your public key; **decrypt before you verify**, or signature checks fail confusingly.
- **`private_key_jwt`, not `client_secret`** — Singpass authenticates your client by a signed assertion verified against **your hosted JWKS**.
- **You host a JWKS** — Singpass reads your public signing + encryption keys from it; rotate keys carefully (keep old keys until tokens expire).
- **Sandbox vs prod** have different issuers, endpoints, and keys.
- **NRIC/FIN/UINFIN is sensitive PII** — mask in logs (`write-service-code` §7), store minimally, follow retention/consent rules.
- **Algorithms, scopes, and endpoints change** — this recipe is the *shape*; the Singpass dev portal is the source of truth.

## Maps to the pattern
auth-code + PKCE → `integrate-identity-providers` §1 · decrypt + JWKS verify + claims → §2 · KYC verified attributes → §5.
