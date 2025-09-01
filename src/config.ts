import {promises as fs} from 'fs';
import os from 'os';
import path from 'path';

export type Config = {
  branchPrefix: string; // e.g., "vd"
  defaultBaseBranch: string | null; // null -> use current branch
  tmpRoot: string | null; // null -> use TMPDIR/vibedove/worktrees
  remoteName: string; // e.g., "origin"
};

const DEFAULTS: Config = {
  branchPrefix: 'vd',
  defaultBaseBranch: null,
  tmpRoot: null,
  remoteName: 'origin',
};

const GLOBAL_PATH = path.join(os.homedir(), '.vibedove', 'config.json');

export async function loadConfig(): Promise<Config> {
  try {
    const data = await fs.readFile(GLOBAL_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...DEFAULTS,
      ...parsed,
    } satisfies Config;
  } catch {
    return DEFAULTS;
  }
}

export function resolveTmpRoot(cfg: Config): string {
  if (cfg.tmpRoot && cfg.tmpRoot.length > 0) return cfg.tmpRoot;
  const tmp = process.env.TMPDIR || os.tmpdir();
  return path.join(tmp, 'vibedove', 'worktrees');
}

