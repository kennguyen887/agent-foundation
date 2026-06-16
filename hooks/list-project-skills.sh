#!/usr/bin/env bash
# SessionStart hook — inject list of available skills from docs/skills/ in the current project.
# Output goes to additionalContext field of the hook response (visible to Claude as context).

set -euo pipefail

# Read JSON input from stdin (may contain cwd info)
input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd // ""' 2>/dev/null || true)
[ -z "$cwd" ] && cwd="$PWD"

skills_dir="$cwd/docs/skills"
[ -d "$skills_dir" ] || exit 0

# Build the list — sort filenames for deterministic prompt cache
lines=()
while IFS= read -r f; do
  [ -f "$f" ] || continue
  name=$(basename "$f" .md)
  [ "$name" = "README" ] && continue
  desc=$(awk '/^description:/{sub(/^description: */,""); print; exit}' "$f")
  if [ -n "$desc" ]; then
    lines+=("- **$name**: $desc")
  else
    lines+=("- **$name**")
  fi
done < <(find "$skills_dir" -maxdepth 1 -name '*.md' | sort)

[ ${#lines[@]} -eq 0 ] && exit 0

# Emit as additionalContext via JSON hook response
ctx=$'## Available project skills (from docs/skills/)\n\n'
ctx+=$(printf '%s\n' "${lines[@]}")
ctx+=$'\n\nBefore starting a task, check whether any skill above matches. If yes, follow it as authoritative.'

jq -n --arg ctx "$ctx" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
