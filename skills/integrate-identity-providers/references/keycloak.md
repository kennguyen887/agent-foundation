# Keycloak — step-by-step integration recipe

> Concrete recipe for [`integrate-identity-providers`](../SKILL.md) — token validation (§2) and Keycloak
> as the **identity broker** (§3); also the service-to-service client-credentials flow
> (`integrate-external-services` §5). Node/TS; verify against your Keycloak version's docs.

## What you're building
Use **Keycloak** as (a) the **token authority** your services validate, and (b) the **broker** fronting
upstream IdPs (Google / Apple / Singpass) so your services trust **one issuer**.

## Environment variables
```bash
KEYCLOAK_HOST=https://auth.example.com
KEYCLOAK_REALM_NAME=your-realm                 # one realm per environment
KEYCLOAK_CLIENT_ID=your-service                # a confidential client per service
KEYCLOAK_CLIENT_SECRET=                        # SERVER-ONLY — vault it
```
Discovery + JWKS URLs are derived: `${KEYCLOAK_HOST}/auth/realms/${KEYCLOAK_REALM_NAME}/.well-known/openid-configuration`.

## Setup & connect
1. Stand up Keycloak; create a **realm per environment** (dev/staging/prod).
2. Create a **confidential client** for each service that needs a machine token (Clients → Credentials → copy the secret → `KEYCLOAK_CLIENT_SECRET`). Enable the **client-credentials** grant.
3. Add upstream IdPs (Realm → **Identity Providers**): Google / Apple / Facebook / **Singpass** — Keycloak runs each OIDC dance and re-issues its own token.
4. Install `jwks-rsa` (fetch signing keys) + `njwt` (verify) + a cache client.
5. Wire a `KeycloakService` that discovers endpoints once and caches them.

## Step 1 — Discover endpoints once (cache them)
```ts
const url = `${KEYCLOAK_HOST}/auth/realms/${KEYCLOAK_REALM_NAME}/.well-known/openid-configuration`;
const { token_endpoint, jwks_uri } = (await http.get(url)).data;   // cache on the instance
```

## Step 2 — Service-to-service token (client_credentials), cached with a latency-safe TTL
```ts
const params = new URLSearchParams({ grant_type: 'client_credentials', client_id: KEYCLOAK_CLIENT_ID, client_secret: KEYCLOAK_CLIENT_SECRET });
const start = Date.now();
const { data } = await http.post(token_endpoint, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
const latencySec = Math.ceil((Date.now() - start) / 1000);
cache.set(key, data, { ttl: data.expires_in - latencySec });       // expire BEFORE Keycloak does
```

## Step 3 — Validate an incoming token via JWKS (prefer local verify over remote introspect)
Parse header → `kid`/`alg` → fetch the signing key from `jwks_uri` (cache it) → verify signature +
claims locally; extract `clientId` + scopes. Faster than calling introspection per request.
```ts
const { kid, alg } = JSON.parse(base64(jwt.split('.')[0]));
const key = await jwks({ jwksUri, cache: true }).getSigningKey(kid);
const verified = njwt.verify(jwt, key.getPublicKey(), alg);        // sig + exp; also check iss/aud
```

## Step 4 — Broker the upstream IdPs (the point of using Keycloak)
Users log in through Keycloak; Keycloak runs each upstream OIDC flow and issues **its own** token. Your
services validate only the Keycloak issuer (Step 3). **Adding an IdP is a Keycloak config change — zero
service code.**

## Gotchas
- **Cache the JWKS**; refresh on an unknown `kid` (key rotation) — don't fetch per request.
- **Subtract round-trip latency** from the cached client-token TTL (Step 2).
- Client **secret in vault**; one client per service; least-privilege scopes.
- **Realm per environment** — never share a realm across envs.
- Validate `iss`/`aud`/`exp` — a valid signature for another audience is still invalid.

## Maps to the pattern
discover + JWKS verify → `integrate-identity-providers` §2 · broker many IdPs → §3 · client-credentials token → `integrate-external-services` §5.
