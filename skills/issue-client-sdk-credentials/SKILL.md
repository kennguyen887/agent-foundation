---
name: issue-client-sdk-credentials
description: Use when a client app talks DIRECTLY to a third-party SDK (real-time video/voice, maps, chat, push) and the backend's job is to mint short-lived signed credentials, manage sessions, and receive the vendor's events — not to proxy the media/data. Covers minting a user-scoped expiring token (the app id + secret stays server-side), a provider-adapter for swappable SDKs, a resilient management API client, session/room lifecycle + real-time signalling, and vendor webhooks. Examples: Tencent TRTC / Agora / Zoom video (UserSig), Mapbox, Firebase. Framework-flexible.
metadata:
  author: Ken Nguyễn <ntnpro@gmail.com>
---

# Issue client-SDK credentials

When a client SDK connects **directly** to a vendor (real-time video/voice, maps, chat, push), the
backend doesn't sit in the data path — its job is to **mint short-lived signed credentials**, **own the
session/room lifecycle**, and **receive the vendor's events**. Examples name real public products
(Tencent TRTC / Agora / Zoom, Mapbox, Firebase); the shape is identical across them. principle →
**▸ Example** → **▸ Other stacks**. Builds on `integrate-external-services` (adapter, resilient HTTP,
webhooks) — read that first; this is the SDK-credential specialization.

## Core principle
**The secret stays on the server; the client gets a short-lived, scoped token.** The backend signs a
credential bound to a user + resource + expiry using the vendor app-id/secret, hands **only the token**
to the client, and the client talks to the vendor SDK directly. The backend never proxies the media/
tiles/messages, but it **owns auth, lifecycle, and event handling**.

## 1. Mint a short-lived, user-scoped, signed credential
- **Sign on the server with the app secret** (from config/vault, never shipped to the client); bind the
  token to a **user id** (+ room/channel/scope where the SDK supports it) and a **short expiry**; return
  only the token. The client re-requests when it expires.
  ```ts
  // secret loaded from config/vault, server-side only
  private signer = new VendorSig(cfg.appId, cfg.appSecret);
  mintAccessToken(userId: string): string {
    return this.signer.genSig(userId, cfg.sigExpireSec);   // user-scoped, expiring; secret never leaves the server
  }
  ```
- **Never** embed the app secret in the mobile/web client, and **never** issue a long-lived/shared
  token — scope per user and expire it.
▸ *Other stacks:* Agora/Twilio Video tokens, a Mapbox temporary token, a Firebase custom token, an AWS
pre-signed URL, a short-lived STS credential. Principle: server signs a narrowly-scoped, expiring token;
client uses it directly against the vendor.

## 2. Provider-adapter for swappable SDKs
- Put the vendor behind **your own interface** so a second provider (or a migration) doesn't ripple
  through callers — the same anti-corruption-adapter rule as `integrate-external-services` §1, here for
  an SDK: token minting + session lifecycle behind one contract, the impl chosen by config/feature flag.
  ```ts
  export interface VideoProvider {
    getPlatform(): Platform;                         // TRTC | ZOOM | AGORA — pick by config/flag
    mintAccessToken(userId: string): string;
    createSession(room: Room): Promise<SessionInfo>;
    isSessionLive(sessionId: string): Promise<boolean>;
    getParticipants(sessionId: string): Promise<string[]>;
    closeSession(sessionId: string): Promise<void>;
  }
  ```
▸ *Other stacks:* ports & adapters / a Strategy per provider. Principle: callers depend on your
interface; the vendor SDK is a swappable plugin.

## 3. A resilient management API client
- The vendor's **server-side admin API** (query a room, list participants, fetch call details, force-end,
  start recording) is just an external HTTP/SDK call — wrap it with **retry + timeout + logging** (the
  resilient-client rule, `integrate-external-services` §2). For *read* helpers, **degrade gracefully**
  (return empty, log a warning) rather than crashing a caller when the vendor is flaky.
  ```ts
  async getRoomInfo(roomId: string): Promise<RoomState[]> {
    try { return (await this.send(() => this.client.DescribeRoomInfo({ roomId }))).rooms ?? []; }
    catch (e) { this.logger.warn('vendor room-info failed', { roomId, e }); return []; }  // degrade, don't throw
  }
  ```
▸ *Other stacks:* same — a thin, retried, timed client around the vendor management API; read paths fail soft.

## 4. Session/room lifecycle + real-time signalling
- **Model the session/room as your own entity** (status, participants, platform) — don't treat the
  vendor as your source of truth. Drive client UI state through **your** realtime channel (WebSocket
  gateway) + push notifications; the vendor SDK carries the media, **you** orchestrate
  start/ring/join/end.
  ```ts
  // host starts → notify participants via your gateway + push; vendor SDK handles the actual media
  await this.gateway.emitRoomMessage({ appointmentId, action: CALL_REQUEST });
  this.eventBus.publish(new StartCallPushEvent({ appointmentId, calleeId }));
  ```
▸ *Other stacks:* your own room state machine + a pub/sub/WebSocket layer for signalling; the SDK is
media-only. Principle: own the orchestration + state; let the SDK own the transport.

## 5. Receive the vendor's webhooks/events
- Vendors emit **events** (room started/ended, recording ready, participant joined) — handle them with
  the inbound-webhook rules (`integrate-external-services` §4: **verify signature, dedupe, fast-ack**),
  then update your room entity and emit your own domain events for downstream (billing, transcripts).
▸ *Other stacks:* same webhook discipline; map vendor event → your domain event via a table.

## Security checklist
- App **secret in a vault/config**, server-side only; **never** in the client bundle.
- Tokens are **short-lived + per-user (+ per-room)**; don't reuse one token across users/sessions.
- Management-API credentials are separate from the signing secret; scope them minimally.
- Don't log tokens/secrets; mask ids (see `write-service-code` §7).

## Verification
- The client receives **only a short-lived, user-scoped token**; the app secret never leaves the server.
- The vendor sits **behind your interface** (token + lifecycle), selected by config — swappable.
- The management API client **retries + times out** and **read paths degrade gracefully**.
- The **room/session is your own entity**; client state is driven by your realtime channel, not the vendor.
- Vendor events are handled as **verified, idempotent, fast-ack** webhooks → your domain events.

## Related
- `integrate-external-services` — §1 (adapter), §2 (resilient HTTP), §4 (webhooks): the general rules this specializes.
- `integrate-internal-services` — emitting domain events from room/session changes; the worker that processes them.
- `secure-a-frontend-app` (the client uses the minted token) · `background-jobs-and-caching` (recording/cleanup jobs) ·
  `write-service-code` §7 (don't log secrets).
