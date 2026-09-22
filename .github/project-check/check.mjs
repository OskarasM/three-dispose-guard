#!/usr/bin/env node
// Read-only repository contract validation. It never runs commands found in documents.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CLUTTER = ['.claude/settings.local.json', '.claude/worktrees', '.superpowers', '.impeccable', '.playwright-mcp', 'graphify-out', 'docs/superpowers'];
const SECTIONS = ['Product', 'Stack', 'Commands', 'Conventions', 'Project docs', 'Done = verified', 'Design'];
const DOCS = {
  'docs/STATE.md': [150, ['Stage', 'Now', 'Blockers', 'Last verified']],
  'docs/ROADMAP.md': [250, ['Next', 'Later', 'Parked', 'Out of scope for now']],
  'docs/DECISIONS.md': [Infinity, []],
};
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null;
const lines = s => s.replace(/\n$/, '').split('\n');
const git = (repo, args, allowed = [0]) => {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true });
  if (r.error || !allowed.includes(r.status)) throw new Error(`git ${args[0]} failed (${r.error?.code ?? r.status}); repository inventory is incomplete`);
  return r;
};
function inside(root, relative) {
  const p = path.resolve(root, relative);
  const rel = path.relative(root, p);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error(`path escapes repository: ${relative}`);
  return p;
}
export function policyFor(id) {
  const data = JSON.parse(fs.readFileSync(new URL('./repo-policies.json', import.meta.url), 'utf8'));
  if (data.version !== 1 || !data.repos || Array.isArray(data.repos)) throw new Error('invalid repo-policies.json schema');
  for (const [name, p] of Object.entries(data.repos)) {
    if (!['tracked', 'local-only'].includes(p.claude) || !['pr', 'local'].includes(p.delivery) || !p.reason ||
        (p.preserveProductAgents !== undefined && typeof p.preserveProductAgents !== 'boolean') ||
        (p.history !== undefined && p.history !== 'skip')) throw new Error(`invalid policy for ${name}`);
  }
  return { claude: 'local-only', delivery: 'pr', preserveProductAgents: false, ...data.repos[id] };
}
function imports(file, errors, seen = new Set()) {
  if (seen.has(file)) return;
  seen.add(file);
  const body = read(file);
  if (body === null) { errors.push(`missing imported file: ${file}`); return; }
  const text = body.replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, '').replace(/\x60[^\x60\n]*\x60/g, '');
  for (const [, ref] of text.matchAll(/(?:^|\s)@([^\s]+)/gm)) {
    const target = ref.startsWith('~/') ? path.join(os.homedir(), ref.slice(2)) : path.resolve(path.dirname(file), ref);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { errors.push(`missing imported file: ${ref}`); continue; }
    if (path.basename(target) !== 'AGENTS.md' && fs.statSync(target).size > 5 * 1024)
      errors.push(`${path.basename(file)} imports @${ref} (${(fs.statSync(target).size / 1024).toFixed(1)} KB > 5 KB); link the path instead`);
    imports(target, errors, seen);
  }
}
function commands(repo, agents, errors, warnings) {
  const packages = new Map();
  const manifest = cwd => {
    const file = path.join(cwd, 'package.json');
    if (packages.has(file)) return packages.get(file);
    let scripts = null;
    if (!fs.existsSync(file)) warnings.push(`not checked: no package.json at ${path.relative(repo, cwd) || '.'}`);
    else {
      try {
        const pkg = JSON.parse(read(file));
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg) ||
            (pkg.scripts != null && (typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts))))
          throw new Error('expected an object with a scripts object');
        scripts = pkg.scripts ?? {};
        if (Object.values(scripts).some(x => typeof x !== 'string')) throw new Error('script values must be strings');
      } catch (e) { errors.push(`${path.relative(repo, file)} is not valid JSON/scripts: ${e.message}`); }
    }
    packages.set(file, scripts);
    return scripts;
  };
  if (fs.existsSync(path.join(repo, 'package.json'))) manifest(repo);
  for (const line of lines(agents)) {
    for (const [, raw] of line.matchAll(/\x60([^\x60\n]+)\x60/g)) {
      let cmd = raw.trim(), cwd = repo;
      const annotated = line.match(/\(cwd:\s*([^)]+)\)/)?.[1];
      if (annotated) cwd = inside(repo, annotated.trim());
      const cd = cmd.match(/^cd\s+([\w./-]+)\s*&&\s*(.*)$/);
      if (cd) { cwd = inside(repo, cd[1]); cmd = cd[2]; }
      if (!/^(npm|pnpm|yarn|bun)\s/.test(cmd)) {
        if (/^(uv|python\d*|cargo|rojo|lune|selene|luau-lsp|dotnet|make|cmake|stylua)\b/.test(cmd))
          warnings.push(`not checked statically: ${raw}; run the project-native check`);
        continue;
      }
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) { errors.push(`command cwd missing: ${cwd}`); continue; }
      if (/[;&|]/.test(cmd)) { warnings.push(`not checked: compound command ${raw}; use one command per entry`); continue; }
      const tokens = cmd.split(/\s+/);
      const pm = tokens.shift();
      if (['--prefix', '-C', '--dir', '--cwd'].includes(tokens[0])) {
        tokens.shift();
        if (!tokens[0]) { errors.push(`command cwd missing in ${raw}`); continue; }
        cwd = inside(repo, tokens.shift());
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) { errors.push(`command cwd missing: ${cwd}`); continue; }
      }
      if (tokens[0]?.startsWith('-')) { warnings.push(`not checked: package-manager flags in ${raw}`); continue; }
      const explicitRun = tokens[0] === 'run';
      if (explicitRun) tokens.shift();
      const name = tokens[0];
      if (!name) { warnings.push(`not checked: incomplete command ${raw}`); continue; }
      if (!explicitRun && ['install', 'i', 'ci', 'add', 'exec', 'dlx', 'x', 'create', 'rebuild', 'audit', 'outdated', 'update', 'version', 'help', 'pack', 'publish'].includes(name)) continue;
      const scripts = manifest(cwd);
      if (scripts && !Object.hasOwn(scripts, name)) errors.push(`AGENTS.md command "${name}" not in ${path.relative(repo, cwd) ? path.relative(repo, cwd) + '/' : ''}package.json scripts`);
    }
  }
}
export function inspect(repo, options = {}) {
  const errors = [], warnings = [], result = { errors, warnings, policy: null };
  try {
    repo = path.resolve(repo);
    if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) { errors.push('repository path is missing or not a directory'); return result; }
    const policy = policyFor(options.repoId ?? path.basename(repo));
    result.policy = policy;
    let tracked = [], hasHead = false;
    if (!options.fixture) {
      const root = git(repo, ['rev-parse', '--show-toplevel']).stdout.trim();
      if ((process.platform === 'win32' ? fs.realpathSync(root).toLowerCase() : fs.realpathSync(root)) !== (process.platform === 'win32' ? fs.realpathSync(repo).toLowerCase() : fs.realpathSync(repo))) throw new Error('pass the repository root, not a subdirectory');
      tracked = git(repo, ['ls-files', '-z']).stdout.split('\0').filter(Boolean);
      hasHead = git(repo, ['rev-parse', '--verify', '--quiet', 'HEAD'], [0, 1]).status === 0;
      if (!hasHead) warnings.push('no committed HEAD: state freshness not checked');
    } else warnings.push('fixture mode: Git inventory and tracking rules not checked');
    const agents = read(path.join(repo, 'AGENTS.md'));
    const claude = read(path.join(repo, 'CLAUDE.md'));
    if (agents === null) errors.push('AGENTS.md missing');
    else {
      if (lines(agents).length > 150) errors.push(`AGENTS.md is ${lines(agents).length} lines (limit 150)`);
      if (agents.includes('{{')) errors.push('AGENTS.md has unfilled {{placeholders}}');
      const found = [...agents.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());
      const missing = SECTIONS.filter(s => !found.includes(s));
      if (missing.length) errors.push(`AGENTS.md missing sections: ${missing.join(', ')}`);
      else if (found.length !== SECTIONS.length || found.some((s, i) => s !== SECTIONS[i])) errors.push('AGENTS.md sections out of template order or duplicated');
      commands(repo, agents, errors, warnings);
      const design = agents.match(/^Visual design: \x60([^\x60]+)\x60/m)?.[1];
      if (!design) errors.push('AGENTS.md missing Visual design pointer');
      else if (!design.startsWith('none') && !fs.existsSync(inside(repo, design))) errors.push(`design file not found: ${design}`);
      const detail = agents.match(/^- Detail: \x60([^\x60]+)\x60/m)?.[1];
      if (detail && detail !== 'none' && !fs.existsSync(inside(repo, detail))) errors.push(`product detail not found: ${detail}`);
      imports(path.join(repo, 'AGENTS.md'), errors);
      let bytes = Buffer.byteLength(agents);
      if (!options.ci) {
        const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
        const global = options.codexGlobal ?? (fs.existsSync(path.join(codexHome, 'AGENTS.override.md')) ? path.join(codexHome, 'AGENTS.override.md') : path.join(codexHome, 'AGENTS.md'));
        bytes += Buffer.byteLength(read(global) ?? '');
      }
      const cap = options.maxBytes ?? 32768;
      if (!Number.isSafeInteger(cap) || cap < 1) throw new Error('maxBytes must be a positive integer');
      if (bytes > cap) errors.push(`AGENTS.md + selected global = ${bytes} bytes (configured check cap ${cap})`);
      warnings.push('instruction bytes: root estimate only; verify effective client limit, overrides, fallback names, nested cwd chain, and actual loading');
    }
    const needsClaude = !(options.ci && policy.claude === 'local-only');
    if (claude === null && needsClaude) errors.push('CLAUDE.md missing');
    if (claude !== null) {
      if (lines(claude).length > 15) errors.push(`CLAUDE.md is ${lines(claude).length} lines (limit 15)`);
      if (!lines(claude).some(l => l.trim() === '@AGENTS.md')) errors.push('CLAUDE.md does not import @AGENTS.md');
      if (claude.includes('{{')) errors.push('CLAUDE.md has unfilled {{placeholders}}');
      imports(path.join(repo, 'CLAUDE.md'), errors);
    }
    if (policy.claude === 'local-only' && tracked.includes('CLAUDE.md')) errors.push('CLAUDE.md must be local-only (untracked) under this repo policy');
    for (const [file, [cap, headings]] of Object.entries(DOCS)) {
      const body = read(path.join(repo, file));
      if (body === null) { errors.push(`${file} missing (template: templates/${file})`); continue; }
      if (body.includes('{{')) errors.push(`${file} has unfilled {{placeholders}}`);
      if (lines(body).length > cap) errors.push(`${file} is ${lines(body).length} lines (limit ${cap})`);
      const found = [...body.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());
      const missing = headings.filter(h => !found.includes(h));
      if (missing.length) errors.push(`${file} missing sections: ${missing.join(', ')}`);
    }
    const state = read(path.join(repo, 'docs/STATE.md'));
    if (state !== null) {
      const now = state.split(/^## /m).find(s => /^Now\s/.test(s)) ?? '';
      const items = (now.match(/^- (?:\[[ xX]\]\s*)?\S/gm) ?? []).length;
      if (items > 3) errors.push(`docs/STATE.md Now has ${items} items (max 3)`);
      const updated = state.match(/^Updated: (\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
      if (!updated) errors.push('docs/STATE.md has no "Updated: YYYY-MM-DD" line');
      else if (!Number.isFinite(Date.parse(updated)) || new Date(updated).toISOString().slice(0,10) !== updated) errors.push('docs/STATE.md Updated is not a valid calendar date');
      else if (hasHead) {
        const code = git(repo, ['log', '-1', '--format=%cs', '--', '.', ':(exclude)docs', ':(exclude)*.md']).stdout.trim();
        if (code && (Date.parse(code) - Date.parse(updated)) / 864e5 > 14) warnings.push(`docs/STATE.md may be stale: Updated ${updated}, last code commit ${code}; verify facts, do not just bump the date`);
      }
    }
    const roots = [...new Set(CLUTTER.map(p => p.startsWith('.claude/') ? '.claude' : p))];
    for (const l of lines(read(path.join(repo, '.gitignore')) ?? '')) {
      const entry = l.trim().replace(/^(\*\*\/|\/)/, '').replace(/\/$/, '');
      if (roots.some(r => entry === r || entry.startsWith(r + '/'))) errors.push(`.gitignore names agent path "${l.trim()}"; remove it (global git ignore covers it)`);
    }
    const clutter = policy.preserveProductAgents ? CLUTTER.filter(p => p !== 'docs/superpowers') : CLUTTER;
    for (const p of clutter) if (tracked.some(f => f === p || f.startsWith(p + '/'))) errors.push(`tracked agent clutter: ${p} (see templates/gitignore-agents)`);
    if (policy.preserveProductAgents) warnings.push('product agent files preserved; review product-vs-runtime content before removing any agent paths');
    warnings.push('static validation does not execute Done commands or verify model behavior');
  } catch (e) { errors.push(e.message); }
  result.errors = [...new Set(errors)];
  result.warnings = [...new Set(warnings)];
  return result;
}
// Compatibility API: errors only; use inspect() for warnings and the resolved policy.
export function check(repo, codexGlobal, options = {}) { return inspect(repo, { ...options, codexGlobal }).errors; }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), opts = {}, repos = [];
  try {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--ci') opts.ci = true;
      else if (a === '--fixture') opts.fixture = true;
      else if (a === '--json') opts.json = true;
      else if (a === '--repo-id') { opts.repoId = args[++i]; if (!opts.repoId || opts.repoId.startsWith('--')) throw new Error('--repo-id needs a value'); }
      else if (a === '--max-bytes') { opts.maxBytes = Number(args[++i]); if (!Number.isSafeInteger(opts.maxBytes) || opts.maxBytes < 1) throw new Error('--max-bytes needs a positive integer'); }
      else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`);
      else repos.push(a);
    }
    if (!repos.length || (opts.repoId && repos.length !== 1)) throw new Error('usage: node check.mjs [--ci] [--json] [--repo-id NAME] [--max-bytes N] <repo>...');
    const reports = repos.map(repo => ({ repo, ...inspect(repo, opts) }));
    if (opts.json) console.log(JSON.stringify(reports, null, 2));
    else for (const r of reports) {
      console.log(`${r.errors.length ? 'FAIL' : 'PASS (static)'} ${r.repo}`);
      for (const e of r.errors) console.log(`  ERROR ${e}`);
      for (const w of r.warnings) console.log(`  WARN  ${w}`);
    }
    process.exitCode = reports.some(r => r.errors.length) ? 1 : 0;
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
