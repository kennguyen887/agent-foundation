# Keycloak — step-by-step integration recipe

> Concrete recipe for [`integrate-identity-providers`](../SKILL.md) — token validation (§2) and using
> Keycloak as the **identity broker** (§3); also the service-to-service client-credentials flow
> (`integrate-external-services` §5). Node/TS; steps port to any language. Verify against your Keycloak
> version's docs.

## What you're building
Use **Keycloak** as (a) the **token authority** your services validate, and (b) the **broker** that
fronts upstream IdPs (Google / Apple / Singpass) so your services only ever trust **one issuer**.

## Prerequisites
- Keycloak host + **realm** name; a confidential client (client id + secret) per service that needs a token.
- Secrets in vault.

## Step 1 — Discover endpoints once (cache them)
```ts
const url = `${host}/auth/realms/${realm}/.well-known/openid-configuration`;
const { token_endpoint, jwks_uri } = (await http.get(url)).data;   // cache on the instance
```

## Step 2 — Service-to-service token (client_credentials), cached with a latency-safe TTL
```ts
const params = new URLSearchParams({ grant_type: 'client_credentials', client_id, client_secret });
const start = Date.now();
const { data } = await http.post(token_endpoint, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
const latencySec = Math.ceil((Date.now() - start) / 1000);
cache.set(key(client_id), data, { ttl: data.expires_in - latencySec });   // expire BEFORE Keycloak does
```
Subtracting the round-trip latency from `expires_in` avoids using a token that expires mid-flight.

## Step 3 — Validate an incoming token via JWKS (prefer local verify over remote introspect)
Parse the JWT header → `kid`/`alg` → fetch the signing key from `jwks_uri` (cache it) → verify the
signature + claims locally. This is faster than calling Keycloak's introspection endpoint per request.
```ts
const { kid, alg } = JSON.parse(base64(jwt.split('.')[0]));
const key = await jwks({ jwksUri, cache: true }).getSigningKey(kid);     // JWKS cached
const verified = njwt.verify(jwt, key.getPublicKey(), alg);              // sig + exp
const { clientId, scope } = verified.body.toJSON();                       // → scopes = scope.split(' ')
```

## Step 4 — Broker the upstream IdPs (the point of using Keycloak)
Configure Google / Apple / Facebook / **Singpass** as **identity providers inside Keycloak** (realm →
Identity Providers). The user logs in through Keycloak; Keycloak runs each upstream OIDC dance and
issues **its own token**. Your services validate only the Keycloak issuer (Step 3). **Adding an IdP is
a Keycloak config change — zero service code.**

## Gotchas
- **Cache the JWKS**, and refresh on an unknown `kid` (key rotation) — don't fetch per request.
- **Subtract latency** from the cached client-token TTL (Step 2).
- Client **secret in vault**; one client per service, least-privilege scopes.
- **Realm per environment** (dev/staging/prod); never share a realm across envs.
- Validate `iss`/`aud`/`exp` — a valid signature on a token for another audience is still invalid.

## Maps to the pattern
discover + JWKS verify → `integrate-identity-providers` §2 · broker many IdPs → §3 · client-credentials token → `integrate-external-services` §5.
