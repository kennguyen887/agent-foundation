#!/usr/bin/env bash
# PreToolUse hook — validate that any Write to docs/skills/*.md has required frontmatter.
# Only fires on Write (not Edit — partial edits don't see the full file).

set -euo pipefail

input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // ""')
[ "$tool" = "Write" ] || exit 0

path=$(echo "$input" | jq -r '.tool_input.file_path // ""')
case "$path" in
  */docs/skills/*.md) ;;
  *) exit 0 ;;
esac

# Skip README.md — it's the template / index, not a skill
case "$(basename "$path")" in
  README.md|readme.md) exit 0 ;;
esac

content=$(echo "$input" | jq -r '.tool_input.content // ""')

missing=()
echo "$content" | grep -q '^name:' || missing+=("name")
echo "$content" | grep -q '^description:' || missing+=("description")
echo "$content" | grep -q '^last-updated:' || missing+=("last-updated")

if [ ${#missing[@]} -gt 0 ]; then
  reason="Skill file missing required frontmatter fields: ${missing[*]}. See docs/skills/README.md template. Add the fields and retry the Write."
  jq -n --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
fi

exit 0
