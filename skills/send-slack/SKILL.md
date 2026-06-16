---
name: send-slack
description: Send a Slack message to a channel or DM using the local send.js script. Use whenever the user asks to send or notify team via Slack.
---

## When to use

When the user asks to send a Slack message, notify a channel, DM someone, or share a PR/update with the team.

## Command

```bash
# Send to a channel
node ~/dev/slack-watcher/src/send.js "#channel-name" "message"

# DM by username
node ~/dev/slack-watcher/src/send.js "@username" "message"

# Pipe from stdin (for long messages)
echo "message content" | node ~/dev/slack-watcher/src/send.js "#channel-name" -
```

## Channel guide

| Channel | Language | Use for |
|---|---|---|
| `#general` | English | PR review requests, global announcements, external-facing updates |
| `#general-dev` | Vietnamese | Internal dev discussion, debugging, team chatter |

## Steps

1. Compose the message — short, English for `#general`, Vietnamese ok for `#general-dev`. PR review requests always go to `#general`.
2. Pick the target:
   - Channel: `"#general"` (reviews), `"#general-dev"` (internal), etc.
   - DM: `"@firstname.lastname"` (match Slack username exactly)
3. Run the command via Bash tool.
4. Confirm success from the script output.

## Examples

```bash
# PR review request to channel
node ~/dev/slack-watcher/src/send.js "#general-dev" "PR for review: https://github.com/your-org/legacy-api/pull/367 — adds smsOptIn field to registration and lead-message APIs for Twilio integration."

# DM
node ~/dev/slack-watcher/src/send.js "@firstname.lastname" "PR ready for your review: https://github.com/your-org/legacy-api/pull/367"

# Long message via stdin
echo "Hey team, two PRs up for review — BE changes for SMS opt-in..." | node ~/dev/slack-watcher/src/send.js "#general-dev" -
```

## Verification

Script prints confirmation or error. If it errors, check that `~/dev/slack-watcher/src/send.js` exists and the Slack token is configured.
