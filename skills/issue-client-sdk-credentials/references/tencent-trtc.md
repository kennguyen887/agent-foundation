# Tencent TRTC (real-time video) — step-by-step integration recipe

> Concrete recipe for [`issue-client-sdk-credentials`](../SKILL.md) — mint a credential (§1), provider
> adapter (§2), resilient management API (§3), session lifecycle + signalling (§4). Node/TS; steps port
> to any language. Verify against current TRTC docs.

## What you're building
1-to-1 / group **video calls** via Tencent **TRTC**. Your backend **mints a `UserSig`** the client SDK
uses to join a room directly; your backend also **queries room/call state** via the TRTC server API and
**orchestrates** the call. The media never flows through your backend.

## Prerequisites
- **SDKAppID** + **SDK secret key** (used to sign `UserSig`).
- Tencent Cloud **SecretId / SecretKey** (separate creds for the server management API) + region.
- All in vault. Note: the UserSig key and the management-API creds are **different** secrets.

## Step 1 — Mint a UserSig (the core; secret stays server-side)
```ts
import * as TLSSigAPIv2 from 'tls-sig-api-v2';
private signer = new TLSSigAPIv2.Api(cfg.sdkAppId, cfg.sdkSecretKey);   // secret: server only
mintUserSig(userId: string): string {
  return this.signer.genSig(userId, cfg.sigExpireSec);                  // user-scoped + short expiry
}
```
Return **only** the `UserSig` to the client (with the `sdkAppId`, `userId`, `roomId`). The client
re-requests when it expires. **Never** ship the SDK secret to the client.

## Step 2 — Put TRTC behind your `VideoProvider` interface (adapter §2)
So Zoom/Agora are swappable and callers stay provider-agnostic:
```ts
getPlatform() { return Platform.TRTC; }
mintAccessToken(userId) { return this.mintUserSig(userId); }
createSession(room) { return { sessionId: room.id, sessionName: room.id }; }
isSessionLive(id) { /* via mgmt API */ }
```

## Step 3 — Server management API (resilient client §3; degrade, don't crash)
Use the Tencent Cloud TRTC client (SecretId/SecretKey) for `DescribeRoomInfo` /
`DescribeCallDetailInfo`, wrapped with retry + a time window; read paths **fail soft**:
```ts
async getRoomInfo(roomId: string): Promise<RoomState[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const res = await this.retry(() => this.client.DescribeRoomInfo({ SdkAppId: cfg.sdkAppId, RoomId: roomId,
      StartTime: now - 300, EndTime: now + 300 }));
    return res.RoomList ?? [];
  } catch (e) { this.logger.warn('TRTC room-info failed', { roomId, e }); return []; }   // degrade
}
```

## Step 4 — Lifecycle + signalling (you orchestrate; the SDK carries media)
Model the room as **your** entity (status, participants, platform). Drive ring/join/end through **your**
WebSocket gateway + push notifications; TRTC only carries the audio/video.
```ts
await this.gateway.emitRoomMessage({ appointmentId, action: CALL_REQUEST });   // your signalling
this.eventBus.publish(new StartCallPushEvent({ appointmentId, calleeId }));    // VoIP push to ring the callee
this.appointmentGateway.sendEventRoomChanged({ statusType: HOST_STARTED_ROOM, room }, room.orgId);
```

## Step 5 — Events → your domain events
Poll room state (Step 3) or handle TRTC event callbacks for started/ended/recording-ready; update your
room entity and emit your own domain events (billing, transcripts) — verify + idempotent if it's a
webhook (`integrate-external-services` §4).

## Gotchas
- **SDK secret in vault**, server-only; mint per-user with a **short expiry** and re-mint on expiry.
- `userId` must be unique + stable per user; don't reuse one UserSig across users.
- The **management-API credential ≠ the UserSig signing key** — scope each minimally.
- Read helpers should **return empty + log** on vendor flakiness, not throw into the call flow.

## Maps to the pattern
mint UserSig → §1 · `VideoProvider` adapter → §2 · resilient mgmt API → §3 · room entity + signalling → §4 · events → §5.
