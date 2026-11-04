#!/usr/bin/env node
// PreToolUse(Bash): never create a git worktree / per-task copy from a shell command.
// Each one is a full checkout plus node_modules and they were never cleaned up
// (disk hit 95% on 2026-08-15). See ~/.claude/rulebook/06-git-commit-rules.md.
// When the user explicitly asks for an isolated worktree, use the EnterWorktree tool or
// the Agent tool's isolation option instead; those are cleaned up by the app.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const bare = (input.tool_input?.command ?? '').replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""');
if (/(^|[;&|\n]\s*)(\S+=\S*\s+)*git(\s+-[Cc]\s+\S+)*\s+worktree\s+add\b/.test(bare)) {
  process.stderr.write(
    'Blocked: do not create git worktrees. Branch in the current checkout (git checkout -b). ' +
      'If the user explicitly asked for an isolated worktree, use the EnterWorktree tool.\n',
  );
  process.exit(2);
}
