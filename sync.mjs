#!/usr/bin/env node
// sync.mjs — Export reusable AI-agent capabilities from ~/.claude into this repo for OSS.
//
// Source : ~/.claude (Claude Code config — but the output layout is agent-agnostic)
// Dest   : this repo (the directory containing this script)
//
// What it does:
//   - Vendors ONLY content you authored (your own skills/hooks). Third-party plugins
//     (superpowers/ecc/compound-engineering/warp) and get-shit-done are recorded as a
//     reference manifest + bootstrap script, never copied verbatim.
//   - Sanitizes personal identifiers (email, org, username, absolute paths).
//   - Redacts MCP secrets to ${PLACEHOLDER} and emits .env.example.
//   - Fails closed (exit 1) if a secret/PII leak survives into the output.
//
// Usage:
//   node sync.mjs              write output + print report
//   node sync.mjs --dry-run    show the plan, write nothing
//   node sync.mjs --check      run the secret scan over existing output only
//
// Zero dependencies. Node 18+.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config — edit these if your identifiers change.
// ---------------------------------------------------------------------------

const HOME = process.env.HOME;
const SRC = path.join(HOME, ".claude");
const DEST = path.dirname(fileURLToPath(import.meta.url));

// Personal/project identifiers scrubbed from every text file that gets vendored.
// Order matters: more specific replacements run first.
const IDENTIFIERS = {
  emails: ["ken.nguyen@original.ventures"],
  orgDomains: ["original.ventures"],
  orgNames: ["Original Ventures"],
  authors: ["Ken Nguyen"],
  usernames: ["moksamoksa"],
  // Project codenames / private GitHub orgs / channels -> generic.
  projectCodenames: [["commonground", "general"], ["Farmers-National", "your-org"], ["FarmersNational", "your-org"]],
  // Colleague handles -> generic placeholder.
  teammates: ["nam.trinh"],
};

// Top-level names under ~/.claude that are trash (logs/caches/state) or sensitive.
const TRASH_DIRS = new Set([
  "backups", "cache", "file-history", "get-shit-done", "gsd-user-files-backup",
  "ide", "metrics", "paste-cache", "projects", "scheduled-tasks", "session-data",
  "session-env", "sessions", "shell-snapshots", "tasks", "telemetry",
]);
const TRASH_FILE_PATTERNS = [
  /^\.credentials\.json$/, /^\.last-/, /^bash-commands\.log$/, /^cost-tracker\.log$/,
  /^history\.jsonl$/, /^gsd-file-manifest\.json$/, /^package\.json$/,
  /^mcp-.*-cache\.json$/, /^policy-limits\.json$/, /^remote-settings\.json$/,
  /^stats-cache\.json$/, /^settings\.json\.bak/, /^settings\.local\.json$/,
];

// Capability directories we scan for YOUR content (plugin/gsd files are excluded).
const CAPABILITY_DIRS = ["skills", "agents", "hooks"];

// Skills that are well-known community downloads, not authored here. Vendored but
// flagged so you can prune anything you'd rather not republish.
const COMMUNITY_HINTS = new Set([
  "caveman", "git-guardrails-claude-code", "grill-with-docs",
  "improve-codebase-architecture", "setup-matt-pocock-skills", "setup-pre-commit",
  "stop-slop", "to-issues", "zoom-out",
]);

// Text extensions get sanitized; anything else is copied byte-for-byte.
const TEXT_EXT = new Set([
  ".md", ".markdown", ".sh", ".bash", ".zsh", ".js", ".cjs", ".mjs", ".ts",
  ".json", ".jsonc", ".txt", ".yaml", ".yml", ".toml", ".env", ".py", ".rb", "",
]);

// Output dirs/files this script owns and rebuilds on every run.
const MANAGED = ["rules", "settings", "mcp", "skills", "agents", "hooks", "plugins",
  "bootstrap.sh", ".env.example", ".gitignore"];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const CHECK_ONLY = args.has("--check");

const report = { vendored: [], referenced: [], redacted: [], flagged: [], leaks: [] };

const isText = (p) => TEXT_EXT.has(path.extname(p).toLowerCase());
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const exists = (p) => fs.existsSync(p);

function writeFile(rel, content) {
  const dest = path.join(DEST, rel);
  if (DRY) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

// ---------------------------------------------------------------------------
// Sanitization — scrub personal identifiers from vendored text.
// ---------------------------------------------------------------------------

function sanitize(text) {
  let out = text;
  // nvm absolute node path -> plain "node" (must run before the generic /Users rule)
  out = out.replace(/\/Users\/[^"'\s]*?\/\.nvm\/versions\/node\/[^"'\s/]+\/bin\/node/g, "node");
  // any home-dir absolute path -> ${HOME}
  out = out.replace(new RegExp(`/Users/${IDENTIFIERS.usernames[0]}`, "g"), "${HOME}");
  for (const email of IDENTIFIERS.emails) {
    out = out.split(email).join("you@example.com");
  }
  for (const dom of IDENTIFIERS.orgDomains) {
    out = out.replace(new RegExp(`[A-Za-z0-9._%+-]+@${dom.replace(".", "\\.")}`, "gi"), "you@example.com");
    out = out.split(dom).join("example.com");
  }
  for (const org of IDENTIFIERS.orgNames) out = out.split(org).join("Example Org");
  for (const author of IDENTIFIERS.authors) out = out.split(author).join("Your Name");
  for (const [code, repl] of IDENTIFIERS.projectCodenames) out = out.split(code).join(repl);
  for (const t of IDENTIFIERS.teammates) out = out.split(t).join("firstname.lastname");
  for (const user of IDENTIFIERS.usernames) out = out.split(user).join("<user>");
  return out;
}

// ---------------------------------------------------------------------------
// Exclusion set — gsd-installed files + plugin caches must never be vendored.
// ---------------------------------------------------------------------------

function loadGsdPaths() {
  const manifest = path.join(SRC, "gsd-file-manifest.json");
  if (!exists(manifest)) return new Set();
  return new Set(Object.keys(readJson(manifest).files || {}));
}

function isGsdManaged(relPath, gsdPaths) {
  if (gsdPaths.has(relPath)) return true;
  for (const p of gsdPaths) if (p.startsWith(relPath + "/")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Vendor authored capabilities (skills / agents / hooks).
// ---------------------------------------------------------------------------

function copyTree(srcPath, destRel) {
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(srcPath)) {
      copyTree(path.join(srcPath, entry), path.join(destRel, entry));
    }
    return;
  }
  if (isText(srcPath)) {
    writeFile(destRel, sanitize(fs.readFileSync(srcPath, "utf8")));
  } else if (!DRY) {
    const dest = path.join(DEST, destRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcPath, dest);
  }
}

function vendorCapabilities(gsdPaths) {
  for (const dir of CAPABILITY_DIRS) {
    const srcDir = path.join(SRC, dir);
    if (!exists(srcDir)) continue;
    for (const entry of fs.readdirSync(srcDir)) {
      const rel = `${dir}/${entry}`;
      if (entry.startsWith("gsd-") || isGsdManaged(rel, gsdPaths)) {
        report.referenced.push(`${rel} (get-shit-done)`);
        continue;
      }
      const tag = COMMUNITY_HINTS.has(entry) ? "⚠ community — review before publish" : "authored";
      report.vendored.push({ rel, tag });
      copyTree(path.join(srcDir, entry), rel);
    }
  }
}

// ---------------------------------------------------------------------------
// Global rules (CLAUDE.md) — sanitize, then flag project-specific prose.
// ---------------------------------------------------------------------------

const PROJECT_NOUNS = ["FarmersNational", "lease", "bid", "offer", "signer", "backdate"];

function exportRules() {
  const src = path.join(SRC, "CLAUDE.md");
  if (!exists(src)) return;
  const clean = sanitize(fs.readFileSync(src, "utf8"));
  writeFile("rules/CLAUDE.md", clean);
  clean.split("\n").forEach((line, i) => {
    for (const noun of PROJECT_NOUNS) {
      if (new RegExp(`\\b${noun}`, "i").test(line)) {
        report.flagged.push(`rules/CLAUDE.md:${i + 1} — "${noun}" — ${line.trim().slice(0, 70)}`);
        break;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// settings.json — de-personalize paths, keep structure.
// ---------------------------------------------------------------------------

function exportSettings() {
  const src = path.join(SRC, "settings.json");
  if (!exists(src)) return;
  const clean = sanitize(fs.readFileSync(src, "utf8"));
  // Pretty-print to normalize whatever sanitize produced.
  writeFile("settings/settings.json", JSON.stringify(JSON.parse(clean), null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// MCP servers — redact secret env values to ${KEY} placeholders.
// ---------------------------------------------------------------------------

function exportMcp() {
  const claudeJson = path.join(HOME, ".claude.json");
  if (!exists(claudeJson)) return [];
  const servers = readJson(claudeJson).mcpServers || {};
  const placeholders = new Set();
  const out = {};
  for (const [name, cfg] of Object.entries(servers)) {
    const copy = JSON.parse(sanitize(JSON.stringify(cfg)));
    for (const key of Object.keys(copy.env || {})) {
      copy.env[key] = `\${${key}}`;
      placeholders.add(key);
      report.redacted.push(`${name}.env.${key}`);
    }
    for (const key of Object.keys(copy.headers || {})) {
      copy.headers[key] = `\${${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}}`;
      placeholders.add(key);
    }
    out[name] = copy;
  }
  writeFile("mcp/servers.json", JSON.stringify({ mcpServers: out }, null, 2) + "\n");
  return [...placeholders];
}

// ---------------------------------------------------------------------------
// Plugin reference manifest + bootstrap script.
// ---------------------------------------------------------------------------

function exportPluginManifest() {
  const pdir = path.join(SRC, "plugins");
  const installed = exists(path.join(pdir, "installed_plugins.json"))
    ? readJson(path.join(pdir, "installed_plugins.json")) : { plugins: {} };
  const markets = exists(path.join(pdir, "known_marketplaces.json"))
    ? readJson(path.join(pdir, "known_marketplaces.json")) : {};
  const gsdVer = exists(path.join(SRC, "gsd-file-manifest.json"))
    ? readJson(path.join(SRC, "gsd-file-manifest.json")).version : null;

  const plugins = Object.entries(installed.plugins || {}).map(([id, entries]) => {
    const e = Array.isArray(entries) ? entries[0] : entries;
    return { id, version: e?.version, gitCommitSha: e?.gitCommitSha };
  });
  const marketplaces = Object.entries(markets).map(([name, m]) => ({ name, source: m.source?.source }));

  const manifest = {
    note: "Reference only. Reproduce with bootstrap.sh — third-party plugin source is NOT vendored here.",
    marketplaces,
    plugins,
    getShitDone: gsdVer ? { version: gsdVer, note: "Installed separately; see https://www.npmjs.com/ or upstream." } : undefined,
  };
  writeFile("plugins/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  plugins.forEach((p) => report.referenced.push(`plugin: ${p.id}@${p.version}`));
  return { marketplaces: markets, plugins };
}

function exportBootstrap({ marketplaces, plugins }) {
  const mpLines = Object.entries(marketplaces).map(([name, m]) => {
    const s = m.source || {};
    const ref = s.repo || s.url || name;
    return `claude plugin marketplace add "${ref}"   # ${name}`;
  });
  const plLines = plugins.map((p) => `claude plugin install "${p.id}"`);
  const body = `#!/usr/bin/env bash
# bootstrap.sh — reproduce this agent setup on a fresh machine.
# Generated by sync.mjs. Review before running.
set -euo pipefail

CLAUDE_DIR="\${HOME}/.claude"
HERE="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing global rules"
mkdir -p "\${CLAUDE_DIR}"
cp "\${HERE}/rules/CLAUDE.md" "\${CLAUDE_DIR}/CLAUDE.md"

echo "==> Installing settings (review paths/env first)"
cp "\${HERE}/settings/settings.json" "\${CLAUDE_DIR}/settings.json"

echo "==> Installing authored skills/hooks"
[ -d "\${HERE}/skills" ] && cp -R "\${HERE}/skills/." "\${CLAUDE_DIR}/skills/" || true
[ -d "\${HERE}/hooks" ]  && cp -R "\${HERE}/hooks/."  "\${CLAUDE_DIR}/hooks/"  || true

echo "==> Adding plugin marketplaces"
${mpLines.join("\n")}

echo "==> Installing plugins"
${plLines.join("\n")}

echo "==> MCP servers: copy mcp/servers.json into your client and supply env vars"
echo "    See .env.example for required secrets (sentry, linear, ...)."
echo
echo "Done. get-shit-done is installed separately — see plugins/manifest.json."
`;
  writeFile("bootstrap.sh", body);
  if (!DRY) fs.chmodSync(path.join(DEST, "bootstrap.sh"), 0o755);
}

function exportEnvExample(placeholders) {
  const lines = ["# Secrets required by mcp/servers.json. Copy to .env and fill in.",
    "# Never commit the real .env (see .gitignore).", ""];
  placeholders.forEach((k) => lines.push(`${k}=`));
  writeFile(".env.example", lines.join("\n") + "\n");
}

function exportGitignore() {
  writeFile(".gitignore", [".env", ".DS_Store", "node_modules/", ""].join("\n"));
}

// ---------------------------------------------------------------------------
// Secret scan — fail closed if PII/secrets leak into the output.
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "aws-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-token", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "slack-token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "openai-style-key", re: /\b(sk|pk|rk)-[A-Za-z0-9]{20,}/ },
  { name: "slack-webhook", re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]+/ },
  { name: "assigned-secret", re: /(token|secret|api[_-]?key|password|access[_-]?token)["'\s:=]+([A-Za-z0-9_\-]{20,})/i },
  { name: "residual-username", re: new RegExp(IDENTIFIERS.usernames[0]) },
  { name: "residual-org", re: /original\.ventures/i },
  { name: "residual-name", re: /ken\.nguyen/i },
  { name: "residual-codename", re: /commonground|Farmers-?National|nam\.trinh/i },
];

// A captured value is a doc placeholder (not a real secret) when it's screaming
// snake-case, angle-bracketed, a ${...} ref, or contains an obvious filler word.
function isPlaceholderValue(v) {
  if (!v) return false;
  if (/\$\{/.test(v) || /^<.+>$/.test(v)) return true;
  if (/^[A-Z][A-Z0-9_]*$/.test(v)) return true;
  return /(YOUR|EXAMPLE|PLACEHOLDER|REDACTED|CHANGEME|TODO|FIXME|DUMMY|SAMPLE|XXXX)/i.test(v);
}

function isAllowed(line, match) {
  if (line.includes("${")) return true;            // intended placeholder
  if (/you@example\.com|example\.com|<user>/.test(line)) return true;
  return isPlaceholderValue(match);
}

function scanForSecrets() {
  const walk = (dir) => {
    if (!exists(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const full = path.join(dir, d.name);
      if (d.name === ".git" || d.name === "node_modules") return [];
      return d.isDirectory() ? walk(full) : [full];
    });
  };
  const files = ["rules", "settings", "mcp", "skills", "agents", "hooks", "plugins"]
    .flatMap((d) => walk(path.join(DEST, d)))
    .concat([".env.example", "bootstrap.sh", "settings/settings.json"]
      .map((f) => path.join(DEST, f)).filter(exists));

  for (const file of [...new Set(files)]) {
    if (!isText(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      for (const { name, re } of SECRET_PATTERNS) {
        const m = line.match(re);
        if (m && !isAllowed(line, m[2] || m[0])) {
          report.leaks.push(`${path.relative(DEST, file)}:${i + 1} — ${name} — ${line.trim().slice(0, 80)}`);
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function cleanManaged() {
  if (DRY) return;
  for (const name of MANAGED) {
    const p = path.join(DEST, name);
    if (exists(p)) fs.rmSync(p, { recursive: true, force: true });
  }
}

function printReport() {
  const h = (s) => `\n\x1b[1m${s}\x1b[0m`;
  console.log(h(`Sync ${DRY ? "(dry-run)" : "complete"} — source ${SRC}`));
  console.log(`\nVendored (${report.vendored.length}):`);
  report.vendored.forEach((v) => console.log(`  ✓ ${v.rel}  [${v.tag}]`));
  console.log(`\nReferenced, not copied (${report.referenced.length}): ${report.referenced.length} items (see plugins/manifest.json)`);
  console.log(`\nRedacted secrets (${report.redacted.length}):`);
  report.redacted.forEach((r) => console.log(`  • ${r} → \${...}`));
  console.log(h(`Project-specific prose to review manually (${report.flagged.length}):`));
  report.flagged.slice(0, 25).forEach((f) => console.log(`  ⚠ ${f}`));
  if (report.flagged.length > 25) console.log(`  … +${report.flagged.length - 25} more`);
}

function main() {
  if (CHECK_ONLY) {
    scanForSecrets();
    finishScan();
    return;
  }
  cleanManaged();
  const gsdPaths = loadGsdPaths();
  vendorCapabilities(gsdPaths);
  exportRules();
  exportSettings();
  const placeholders = exportMcp();
  const pluginData = exportPluginManifest();
  exportBootstrap(pluginData);
  exportEnvExample(placeholders);
  exportGitignore();
  printReport();
  if (!DRY) {
    scanForSecrets();
    finishScan();
  } else {
    console.log("\n(dry-run: no files written, secret scan skipped)");
  }
}

function finishScan() {
  if (report.leaks.length) {
    console.log(`\n\x1b[31m✗ Secret scan FAILED — ${report.leaks.length} potential leak(s):\x1b[0m`);
    report.leaks.forEach((l) => console.log(`  ✗ ${l}`));
    console.log("\nFix the source or add to the sanitizer, then re-run. Output left in place for inspection.");
    process.exit(1);
  }
  console.log("\n\x1b[32m✓ Secret scan passed — no PII/secrets detected in output.\x1b[0m");
  console.log("Review flagged prose above, then commit when satisfied.");
}

main();
