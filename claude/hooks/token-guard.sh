#!/usr/bin/env bash
# Token guard. Four modes, all read the hook JSON on stdin.
#   stop    after each turn: if the context is big, write the handover, show when the prompt cache goes
#           cold, and remember this session as the one to resume if the terminal is /clear-ed. The
#           handover is written here, not only at the end, so the file the notice points at always
#           exists: the process can be killed or restarted without ever reaching SessionEnd.
#   prompt  on submit: if the cache is already cold and the context is big, write the handover and show
#           a notice. Never blocks the prompt.
#   end     SessionEnd (/clear, exit): write the handover, so the resume starts from the final state.
#   start   SessionStart after /clear: point the new session at the cleared one's handover and pending
#           prompt, so resuming needs no copy-paste.
# The handover is one file PER SESSION ($HANDOVER_DIR/<session_id>.md), never a per-folder name: sessions
# sharing a checkout must not resume from each other's state. It is a mechanical snapshot of the
# transcript (no model call). The cleared session is found through the claude process that runs the hook:
# /clear keeps the process and changes the session id, and peer sessions run in other processes.
# When the app restarts that process the new session has a new pid, so a marker whose own process is
# gone is adopted by the next session in the same folder (an orphan) — a live peer's marker never is.
# The cache TTL is the promptCacheTtl setting (unset = 1h on a subscription within limits).
set -euo pipefail
MODE=${1:-}
TTL=${TOKEN_GUARD_TTL_SECONDS:-3600}
MIN_CTX=${TOKEN_GUARD_MIN_CONTEXT:-120000}
HANDOVER_DIR=${TOKEN_GUARD_HANDOVER_DIR:-$HOME/.claude/handovers}

claude_pid() {
  local p=$PPID comm
  while [ "${p:-0}" -gt 1 ]; do
    comm=$(ps -o comm= -p "$p" 2>/dev/null) || return 0
    case "$comm" in *claude) echo "$p"; return 0 ;; esac
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ') || return 0
  done
}

input=$(cat)
transcript=$(jq -r '.transcript_path // empty' <<<"$input")
session=$(jq -r '.session_id // "unknown"' <<<"$input")
handover="$HANDOVER_DIR/$session.md"
pid=$(claude_pid)
marker=${pid:+$HANDOVER_DIR/.resume-$pid}
proc_started=${pid:+$(ps -o lstart= -p "$pid" 2>/dev/null || true)}

# The newest marker left by a session in this folder whose claude process is gone. A marker whose
# process is still running belongs to a live peer session and is never taken.
orphan_marker() {
  local cwd f m p started
  cwd=$(jq -r '.cwd // ""' <<<"$input")
  [ -n "$cwd" ] || return 0
  while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] || continue
    [ -n "$(find "$f" -mmin -180 2>/dev/null)" ] || continue
    m=$(cat "$f" 2>/dev/null) || continue
    if [ "$(jq -r '.cwd // ""' <<<"$m")" != "$cwd" ]; then continue; fi
    p=${f##*.resume-}
    started=$(ps -o lstart= -p "$p" 2>/dev/null || true)
    if [ -n "$started" ] && [ "$started" = "$(jq -r '.proc_started' <<<"$m")" ]; then continue; fi
    printf '%s\n' "$f"
    return 0
  done < <(ls -at "$HANDOVER_DIR" 2>/dev/null | grep '^\.resume-' | sed "s|^|$HANDOVER_DIR/|")
}

# SessionStart: hand the previous session's handover to the new one, once.
announce_resume() {
  local f=${1:-} m
  [ -n "$f" ] && [ -f "$f" ] || return 0
  m=$(cat "$f")
  rm -f "$f"
  [ "$(jq -r '.session' <<<"$m")" != "$session" ] || return 0
  [ -f "$(jq -r '.handover' <<<"$m")" ] || return 0
  jq -nc --argjson m "$m" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: (
    "Resume: the session before this one in this folder was \($m.session) (folder \($m.cwd), branch \($m.branch)). Its handover is \($m.handover)."
    + (if ($m.progress // "") != "" then " Its task progress file (the curated state: done / next / evidence) is \($m.progress); Read that first, and the handover after it for the last requests." else "" end)
    + (if $m.prompt != "" then " Its last prompt was blocked for a cold cache and is still pending: «\($m.prompt)»." else "" end)
    + " If the user'"'"'s message continues that work or is a go-ahead such as \"tiếp\" or \"continue\", Read those files first, then carry out the pending prompt. If it starts something unrelated, ignore this. Never resume from another session'"'"'s progress file instead.")}}'
}

if [ "$MODE" = start ]; then
  find "$HANDOVER_DIR" -maxdepth 1 -name '.resume-*' -mtime +2 -delete 2>/dev/null || true
  case "$(jq -r '.source // ""' <<<"$input")" in
    clear | startup)
      if [ -n "$marker" ] && [ -f "$marker" ] && [ "$(jq -r '.proc_started' "$marker")" = "$proc_started" ]; then
        announce_resume "$marker"
      else
        announce_resume "$(orphan_marker)"
      fi
      ;;
    resume) rm -f "${marker:-/nonexistent}" ;;
  esac
  exit 0
fi

[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0
last=$(grep '"type":"assistant"' "$transcript" | tail -1)
[ -n "$last" ] || exit 0
ctx=$(jq -r '.message.usage | (.input_tokens + (.cache_read_input_tokens // 0) + (.cache_creation_input_tokens // 0))' <<<"$last")
ts=$(jq -r '.timestamp' <<<"$last" | sed -E 's/\.[0-9]+Z$/Z/')
last_epoch=$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$ts" +%s 2>/dev/null || date -u -d "$ts" +%s)
now=$(date +%s)
gap=$((now - last_epoch))
ctx_k=$((ctx / 1000))

# The task progress files this session wrote (the curated state the rulebook asks for), most recent
# last, as ~-paths, one per line. The per-session snapshots (<session_id>.md) are this hook's own, not these.
# grep narrows the transcript to Edit/Write lines first so the Stop hook stays cheap on big transcripts.
progress_files() {
  grep -E '"name":"(Edit|Write|MultiEdit)"' "$transcript" 2>/dev/null \
    | grep -iE 'progress[^/"]*\.md"|/handovers/[^/"]+\.md"' \
    | jq -r '.message.content[]? | select(.type == "tool_use") | .input.file_path // empty' 2>/dev/null \
    | grep -iE '(progress|handover)[^/]*\.md$|/handovers/[^/]+\.md$' \
    | grep -vE '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md$' \
    | awk '{ last[$0] = NR } END { for (k in last) print last[k], k }' | sort -n | tail -3 | cut -d' ' -f2- \
    | sed "s|^$HOME/|~/|" || true
}
progress=$(progress_files)
progress_list=$(paste -sd, - <<<"$progress" | sed 's/,/, /g')

# Remember this session as the one a /clear in this terminal resumes. No argument keeps the pending
# prompt already saved for this session; an argument replaces it ("" drops it).
save_marker() {
  [ -n "$marker" ] || return 0
  local prompt=""
  if [ $# -gt 0 ]; then
    prompt=$1
  elif [ -f "$marker" ]; then
    prompt=$(jq -r --arg s "$session" 'if .session == $s then .prompt else "" end' "$marker" 2>/dev/null || true)
  fi
  mkdir -p "$HANDOVER_DIR"
  jq -nc --arg session "$session" --arg handover "$handover" --arg prompt "$prompt" --arg proc_started "$proc_started" \
    --arg progress "$progress_list" --arg cwd "$(jq -r '.cwd // ""' <<<"$last")" --arg branch "$(jq -r '.gitBranch // ""' <<<"$last")" \
    '$ARGS.named' >"$marker.tmp" && mv "$marker.tmp" "$marker"
}

# Most recent PR / Linear links, deduped, oldest first.
recent_links() {
  grep -v '"type":"api-request-blob"' "$transcript" \
    | grep -oE 'https://(github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/pull/[0-9]+|linear\.app/[A-Za-z0-9_-]+/issue/[A-Z]+-[0-9]+)' \
    | awk '{ last[$0] = NR } END { for (k in last) print last[k], k }' | sort -n | tail -10 | cut -d' ' -f2 || true
}

write_handover() {
  local reason=$1 tmp
  mkdir -p "$HANDOVER_DIR"
  find "$HANDOVER_DIR" -maxdepth 1 -name '????????-????-????-????-????????????.md' -mtime +30 -delete 2>/dev/null || true
  tmp=$(mktemp "$HANDOVER_DIR/.tmp.XXXXXX")
  jq -n -r --arg sid "$session" --arg transcript "$transcript" --arg reason "$reason" \
    --arg when "$(date '+%Y-%m-%d %H:%M %Z')" --arg links "$(recent_links)" '
    def text_of: if (.message.content | type) == "string" then .message.content
      else [.message.content[]? | select(.type == "text") | .text] | join("\n") end;
    def bullets($xs; $none): if ($xs | length) == 0 then "- \($none)" else $xs | map("- " + .) | join("\n") end;
    reduce (inputs | select((.type == "user" or .type == "assistant") and (.isSidechain | not))) as $e
      ({prompts: [], reply: "", files: [], branch: "", cwd: ""};
       .branch = ($e.gitBranch // .branch) | .cwd = ($e.cwd // .cwd)
       | if $e.type == "user" then
           ($e | text_of) as $t
           | if ($e.isMeta | not) and ($t | length) > 0
                and ($t | test("^\\s*<(command-|local-command-|system-reminder|task-notification)") | not)
             then .prompts = (.prompts + [$t[0:600]])[-5:] else . end
         else
           reduce ($e.message.content[]?) as $c (.;
             if $c.type == "text" and ($c.text | length) > 0 then .reply = $c.text
             elif $c.type == "tool_use" and (["Edit", "Write", "MultiEdit", "NotebookEdit"] | index($c.name))
                  and ($c.input.file_path // "") != "" then
               .files = (.files - [$c.input.file_path]) + [$c.input.file_path]
             else . end)
         end)
    | (.files | map(select(test("(progress|handover)[^/]*\\.md$|/handovers/[^/]+\\.md$"; "i")))) as $progress
    | "# Handover · session \($sid)\n"
      + "Mechanical snapshot by token-guard.sh at \($when) (\($reason)). No model wrote it; verify before acting.\n\n"
      + "- Folder: \(.cwd)\n- Branch this session was on: \(.branch)\n"
      + "- Transcript: \($transcript) (grep it for detail, never read it whole)\n\n"
      + "## Rules for the session resuming from this\n"
      + "- This file is this session'"'"'s state. Other sessions share the folder: do not read `.claude/progress.md` or any other handover unless it is listed under Progress files below.\n"
      + "- Run `git branch --show-current` first. Not the branch above = another session moved the checkout: confirm before editing.\n\n"
      + "## Progress files this session wrote\n" + bullets($progress; "none") + "\n\n"
      + "## Last requests from the user (oldest first)\n"
      + ([.prompts | to_entries[] | "\(.key + 1). \(.value | gsub("\n"; " "))"] | join("\n")) + "\n\n"
      + "## Last reply\n"
      + (if (.reply | length) > 7000 then .reply[0:2500] + "\n\n…(middle cut, grep the transcript)…\n\n" + .reply[-4500:] else .reply end) + "\n\n"
      + "## Files edited\n" + bullets(.files[-20:]; "none") + "\n\n"
      + "## PRs / tickets mentioned (most recent last)\n" + bullets($links | split("\n") | map(select(length > 0)); "none")
    ' "$transcript" >"$tmp" && mv "$tmp" "$handover" || rm -f "$tmp"
}

# Without the claude process there is no automatic resume, so fall back to the line to paste. With it,
# the paste line is still printed on its own line: the exact file to copy if the auto-resume misses.
resume_hint() {
  local paste="read $handover and continue$1"
  [ -z "$progress_list" ] || paste="read $progress_list and $handover, and continue$1"
  if [ -z "$marker" ]; then
    echo "/clear, then send: $paste"
  elif [ -n "$progress_list" ]; then
    printf '%s\n%s' "/clear, then send any message (e.g. \"tiếp\"): the new session reads $progress_list (+ this session's handover) and continues$1." "If it does not resume, send: $paste"
  else
    printf '%s\n%s' "/clear, then send any message (e.g. \"tiếp\"): the new session reads this one's handover and continues$1." "If it does not resume, send: $paste"
  fi
}

case "$MODE" in
  stop)
    [ "$ctx" -ge "$MIN_CTX" ] || exit 0
    save_marker
    write_handover "turn end"
    cold_at=$(date -r $((now + TTL)) +%H:%M)
    jq -nc --arg m "Context ~${ctx_k}k tokens. Cache goes cold at ~${cold_at} if idle. Leaving longer: $(resume_hint "")." '{systemMessage:$m}'
    ;;
  prompt)
    [ "$gap" -ge "$TTL" ] && [ "$ctx" -ge "$MIN_CTX" ] || exit 0
    save_marker ""
    write_handover "cold cache"
    jq -nc --arg m "Idle $((gap / 60)) min, longer than the $((TTL / 60)) min cache: this turn re-reads ~${ctx_k}k tokens at full price. Cheaper next time: $(resume_hint "")." '{systemMessage:$m}'
    ;;
  end)
    [ "$ctx" -ge "$MIN_CTX" ] || [ -f "$handover" ] || exit 0
    reason=$(jq -r '.reason // "unknown"' <<<"$input")
    if [ "$reason" = clear ]; then save_marker; else rm -f "${marker:-/nonexistent}"; fi
    write_handover "session end: $reason"
    ;;
esac
