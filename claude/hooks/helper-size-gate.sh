#!/usr/bin/env bash
# STOP-BEFORE-WRITING gate (see ~/.claude/CLAUDE.md).
#
# A non-business-logic helper crossing ~40 lines is the signal that the problem has a
# generic name and therefore a package. This fires the gate mechanically, because the
# written rule alone did not: EmailDomain.js shipped as 176 hand-rolled lines when `psl`
# was already in the tree.
#
# Advisory only — never blocks. Warns once per file per day so it does not nag.
set -uo pipefail

THRESHOLD=40

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_response.filePath // .tool_input.file_path // empty' 2>/dev/null)

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  */node_modules/*|*/dist/*|*/build/*|*/.git/*|*/vendor/*) exit 0 ;;
esac

# Helper-ish location only: this gate is about plumbing, not domain code.
printf '%s' "$file" | grep -qiE '/(helpers?|utils?|lib|common|shared)/' || exit 0
# Real source files only.
printf '%s' "$file" | grep -qE '\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|php)$' || exit 0
# Tests are allowed to be long.
printf '%s' "$file" | grep -qiE '(\.test\.|\.spec\.|__tests__|/tests?/)' && exit 0

lines=$(wc -l < "$file" | tr -d '[:space:]')
[ "${lines:-0}" -gt "$THRESHOLD" ] || exit 0

# One warning per file per day.
seen_dir="${TMPDIR:-/tmp}/claude-helper-gate-$(date +%Y%m%d)"
mkdir -p "$seen_dir" 2>/dev/null
key=$(printf '%s' "$file" | shasum | cut -c1-16)
[ -e "$seen_dir/$key" ] && exit 0
: > "$seen_dir/$key"

jq -n --arg file "$file" --arg base "$(basename "$file")" --arg lines "$lines" '{
  systemMessage: ("STOP-BEFORE-WRITING gate — " + $base + " is " + $lines + " lines of helper code"),
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: (
      "STOP-BEFORE-WRITING gate (~/.claude/CLAUDE.md): " + $file + " is " + $lines
      + " lines of non-business-logic helper code, past the ~40-line tripwire.\n"
      + "1. Name the problem in generic words. If it has a generic name, a package exists.\n"
      + "2. Check the tree FIRST — require.resolve / ls node_modules/.pnpm / grep package.json. It is often already a transitive dep, so adopting it costs one declaration line.\n"
      + "3. Either replace this with that package, or state in your reply the specific reason none fits.\n"
      + "Do not finish a hand-rolled version just because it already works."
    )
  }
}'
