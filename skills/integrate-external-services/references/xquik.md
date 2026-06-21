# Xquik (public X data) - step-by-step integration recipe

> Concrete recipe for [`integrate-external-services`](../SKILL.md) section 1
> (adapter), section 2 (resilient HTTP), and section 4 (webhooks). Node/TS examples;
> verify endpoint fields against the current public docs and OpenAPI before coding.
> Written from Xquik public docs and OpenAPI.

## What you're building
Public X data lookup, search, monitoring events, or webhook-backed delivery via Xquik, behind a
server-side `SocialDataReader` or `PublicXDataProvider` interface. App code should depend on your
interface, not raw Xquik response shapes.

## Environment variables

```bash
XQUIK_API_KEY=                         # SERVER-ONLY
XQUIK_BASE_URL=https://xquik.com
XQUIK_WEBHOOK_URL=https://api.example.com/webhooks/xquik
XQUIK_WEBHOOK_SECRET=                  # returned when the webhook is created; store once
```

Never put `XQUIK_API_KEY` or webhook secrets in client-exposed environment variables.

## Setup & connect

1. Check the current public sources before choosing endpoints:
   - API overview: `https://docs.xquik.com/api-reference/overview`
   - MCP overview, if the feature is agent-facing: `https://docs.xquik.com/mcp/overview`
   - OpenAPI schema: `https://xquik.com/openapi.json`
   - TypeScript package metadata, if using the SDK path: `npm view x-developer version license repository.url`
2. Use REST when you need exact OpenAPI coverage, or the published SDK when it covers the workflow.
3. Keep Xquik behind a boundary your application owns. Do not let controllers or UI code call Xquik
   directly.
4. Store the API key only in the backend runtime config and inject it into the adapter.

## Step 1 - Build the server-side client

```ts
type SearchTweetsInput = {
  q: string;
  limit?: number;
  cursor?: string;
};

class XquikClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async searchTweets(input: SearchTweetsInput): Promise<unknown> {
    const params = new URLSearchParams({ q: input.q });
    if (input.limit !== undefined) params.set("limit", String(input.limit));
    if (input.cursor) params.set("cursor", input.cursor);

    return this.get(`/api/v1/x/tweets/search?${params.toString()}`);
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetcher(new URL(path, this.baseUrl), {
      headers: {
        "x-api-key": this.apiKey,
        "xquik-api-contract": "2026-04-29",
      },
    });

    if (!response.ok) throw await this.toDomainError(response);
    return response.json();
  }

  private async toDomainError(response: Response): Promise<Error> {
    const body = await response.text().catch(() => "");
    return new Error(`Xquik request failed: ${response.status} ${body.slice(0, 160)}`);
  }
}
```

Use the documented paths for the workflow, for example:

- `GET /api/v1/x/tweets/search` for query-based tweet search
- `GET /api/v1/x/tweets/{id}` for a tweet lookup
- `GET /api/v1/x/users/{id}` for a profile lookup
- `GET /api/v1/events` for monitor event reads
- `POST /api/v1/webhooks` to register event delivery

## Step 2 - Put Xquik behind your domain interface

```ts
export interface SocialDataReader {
  searchTweets(input: SearchTweetsInput): Promise<ReadonlyArray<TweetSummary>>;
}

export class XquikSocialDataReader implements SocialDataReader {
  constructor(private readonly client: XquikClient) {}

  async searchTweets(input: SearchTweetsInput): Promise<ReadonlyArray<TweetSummary>> {
    const raw = await this.client.searchTweets(input);
    return mapXquikTweets(raw);
  }
}
```

Keep the mapper narrow: return only fields the app needs, normalize pagination names once, and map
Xquik error codes to your own error taxonomy.

## Step 3 - Webhooks and monitor events

If the feature needs pushed events:

1. Create the callback route in your app first. It must capture the raw request body before JSON
   parsing, reject unverified deliveries, dedupe event IDs, and enqueue processing before acking.
2. Register the webhook with `POST /api/v1/webhooks` using `url` and `eventTypes`.
3. Store the returned `secret` immediately. It is returned only at creation time.
4. Verify delivery signatures exactly as the current Xquik docs specify. If the current public docs
   or OpenAPI do not expose the header and canonical string contract, do not guess. Pause the webhook
   receiver and ask for the verified signature contract before enabling it.
5. Read missed or replay-needed activity with `GET /api/v1/events`, filtered by monitor or event type
   when needed.

## Gotchas

- API keys and webhook secrets are server-only. Never expose them through frontend env vars, logs, or
  client error payloads.
- Treat Xquik as an external dependency: set per-call timeouts, retry only idempotent reads, and use
  a circuit breaker around repeated failures.
- Do not build a broad passthrough endpoint. Expose small application-specific methods such as
  `searchTweets`, `getTweet`, or `listMonitorEvents`.
- Pin response assumptions to OpenAPI. If docs and OpenAPI disagree, trust OpenAPI for request and
  response shape and leave a note in the implementation summary.
- Do not log full tweet/user payloads by default; they may contain personal data. Log request IDs,
  status codes, and sanitized error codes instead.

## Maps to the pattern

adapter + response mapping -> section 1 - resilient client -> section 2 - API key config -> section 3 -
webhook verify + idempotent fast-ack -> section 4.
