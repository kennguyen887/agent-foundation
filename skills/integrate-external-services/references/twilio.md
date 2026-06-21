# Twilio (SMS) — step-by-step integration recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) §1 (the notification provider behind
> your `send()` facade) and §4 (inbound status webhook). Node/TS; **verify against current Twilio docs**.
> Written from Twilio's public API (no repo-specific code) — adapt field names as needed.

## What you're building
Outbound **SMS** (OTP, alerts, reminders) via Twilio, behind your channel-agnostic notification
`send()` facade, with an inbound **status callback** webhook to track delivered/failed.

## Environment variables
```bash
TWILIO_ACCOUNT_SID=AC...                 # Console dashboard
TWILIO_API_KEY_SID=SK...                 # prefer an API key over the raw auth token
TWILIO_API_KEY_SECRET=                   # SERVER-ONLY
TWILIO_AUTH_TOKEN=                        # needed to validate inbound webhook signatures
TWILIO_MESSAGING_SERVICE_SID=MG...        # a Messaging Service (sender pool); or TWILIO_FROM_NUMBER=+1...
TWILIO_STATUS_CALLBACK_URL=https://api.example.com/webhooks/twilio/status
```

## Setup & connect
1. Create a Twilio account; buy a number **or** create a **Messaging Service** (Console → Messaging) and add senders → `TWILIO_MESSAGING_SERVICE_SID`.
2. Create an **API key** (Console → Account → API keys) → `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` (preferred over the raw auth token for sending). Keep `TWILIO_AUTH_TOKEN` for webhook validation.
3. Install the SDK: `npm i twilio`.
4. Set the **status callback URL** on the Messaging Service (or per message) → `TWILIO_STATUS_CALLBACK_URL`.
5. Wire a `TwilioProvider` behind your notification `send()` facade (adapter §1) so callers stay channel-agnostic.
```ts
const client = twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_KEY_SECRET, { accountSid: process.env.TWILIO_ACCOUNT_SID });
```

## Step 1 — Send an SMS (behind the facade)
```ts
async sendSms({ to, body }: { to: string; body: string }) {
  return this.client.messages.create({
    to,                                                   // E.164, e.g. +6591234567
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    body,
    statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
  });
}
```
The Messaging Service picks the sender + handles compliance/opt-out. Map Twilio errors → your error.

## Step 2 — Inbound status webhook (verify the signature)
Twilio signs callbacks with **`X-Twilio-Signature`** (HMAC-SHA1 of the full URL + sorted POST params,
keyed by your auth token). Verify with the SDK's `validateRequest` before trusting the status:
```ts
@Post('/webhooks/twilio/status')
status(@Req() req, @Headers('x-twilio-signature') sig: string) {
  const url = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, sig, url, req.body)) throw new BadRequestError('bad signature');
  // req.body.MessageStatus: queued | sent | delivered | undelivered | failed  → update your record
}
```
Idempotent: dedupe by `MessageSid` (pattern §4).

## Gotchas
- The signature is over the **exact callback URL** (scheme, host, path, query) Twilio called — a proxy that rewrites it breaks validation; configure the public URL.
- Use a **Messaging Service**, not a hard-coded `from` number — it handles sender selection + opt-out.
- Numbers must be **E.164**; handle `undelivered`/`failed` statuses (don't assume sent = delivered).
- Don't log message bodies (may contain OTPs/PII) — mask (`write-service-code` §7).

## Maps to the pattern
provider behind the `send()` facade → §1 · resilient client → §2 · status webhook verify + idempotent → §4.
