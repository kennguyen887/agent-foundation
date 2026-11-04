#!/bin/bash
# SessionEnd hook: when a session that ran inside a <repo>/.claude/worktrees/<name>
# worktree ends, remove that worktree if it is clean. Dirty worktrees are kept
# (git worktree remove without --force refuses them anyway). Branches and stashes
# are never touched. Sessions that die without firing SessionEnd fall back to
# Claude Code's built-in cleanupPeriodDays sweep.
set -u

cwd=$(jq -r '.cwd // empty' 2>/dev/null)
[ -z "$cwd" ] && exit 0

case "$cwd" in
  */.claude/worktrees/*) ;;
  *) exit 0 ;;
esac

# linked worktrees have a .git FILE pointing back at the main repo
[ -f "$cwd/.git" ] || exit 0
git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ -n "$(git -C "$cwd" status --porcelain 2>/dev/null)" ] && exit 0

# remove through the main repo so git's worktree bookkeeping stays consistent
common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
main=$(dirname "$common")
git -C "$main" worktree unlock "$cwd" >/dev/null 2>&1 || true
git -C "$main" worktree remove "$cwd" >/dev/null 2>&1 || true
exit 0
