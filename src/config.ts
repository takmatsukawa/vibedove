import {promises as fs} from 'fs';
import os from 'os';
import path from 'path';
import { $ } from 'bun';

export type Config = {
  branchPrefix: string; // e.g., "vd"
  defaultBaseBranch: string | null; // null -> use current branch
  tmpRoot: string | null; // null -> use TMPDIR/vibedove/worktrees
  remoteName: string; // e.g., "origin"
  editor: string | null; // e.g., "code" or "$EDITOR" value
};

export type ProjectConfig = {
  // Command to run after creating a worktree for a task
  setupScript: string | null; // e.g., "bun install" or "npm install"
};

export const DEFAULTS: Config = {
  branchPrefix: 'vd',
  defaultBaseBranch: null,
  tmpRoot: null,
  remoteName: 'origin',
  editor: process.env.EDITOR ?? null,
};

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  setupScript: null,
};

const GLOBAL_PATH = path.join(os.homedir(), '.vibedove', 'config.json');

async function ensureDir(p: string) {
  await fs.mkdir(p, {recursive: true});
}

export async function loadConfig(createIfMissing = false): Promise<Config> {
  try {
    const data = await fs.readFile(GLOBAL_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...DEFAULTS,
      ...parsed,
    } satisfies Config;
  } catch {
    if (createIfMissing) {
      await saveConfig(DEFAULTS);
    }
    return DEFAULTS;
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  const dir = path.dirname(GLOBAL_PATH);
  await ensureDir(dir);
  await fs.writeFile(GLOBAL_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

export function resolveTmpRoot(cfg: Config): string {
  if (cfg.tmpRoot && cfg.tmpRoot.length > 0) return cfg.tmpRoot;
  const tmp = process.env.TMPDIR || os.tmpdir();
  return path.join(tmp, 'vibedove', 'worktrees');
}

// Per-project config lives alongside the board at ~/.vibedove/projects/<repo>/config.json
export async function loadProjectConfig(cwd = process.cwd()): Promise<ProjectConfig> {
  const root = await repoTopLevel(cwd);
  const file = path.join(projectStorageDir(root), 'config.json');
  try {
    const data = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...DEFAULT_PROJECT_CONFIG,
      ...parsed,
    } satisfies ProjectConfig;
  } catch {
    return DEFAULT_PROJECT_CONFIG;
  }
}

function projectStorageDir(repoRoot: string): string {
  return path.join(os.homedir(), '.vibedove', 'projects', sanitizePathForDir(repoRoot));
}

async function repoTopLevel(cwd: string): Promise<string> {
  const p = await $`git -C ${cwd} rev-parse --show-toplevel`.nothrow();
  if (p.exitCode === 0) return (await p.text()).trim();
  return cwd;
}

function sanitizePathForDir(p: string): string {
  return p.replace(/[:/\\]/g, '_');
}
