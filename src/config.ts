import {promises as fs} from 'fs';
import os from 'os';
import path from 'path';

export type Config = {
  branchPrefix: string; // e.g., "vd"
  defaultBaseBranch: string | null; // null -> use current branch
  tmpRoot: string | null; // null -> use TMPDIR/vibedove/worktrees
  remoteName: string; // e.g., "origin"
  editor: string | null; // e.g., "code" or "$EDITOR" value
};

export const DEFAULTS: Config = {
  branchPrefix: 'vd',
  defaultBaseBranch: null,
  tmpRoot: null,
  remoteName: 'origin',
  editor: process.env.EDITOR ?? null,
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
