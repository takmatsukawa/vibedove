import {promises as fs} from 'fs';
import path from 'path';
import { $ } from 'bun';

export async function currentBranch(cwd = process.cwd()): Promise<string> {
  const out = await $`git -C ${cwd} rev-parse --abbrev-ref HEAD`.text();
  return out.trim();
}

export async function branchExists(name: string, cwd = process.cwd()): Promise<boolean> {
  const p = await $`git -C ${cwd} rev-parse --verify --quiet ${name}`.nothrow();
  return p.exitCode === 0;
}

export async function createBranch(name: string, base: string, cwd = process.cwd()): Promise<void> {
  if (await branchExists(name, cwd)) return;
  const p = await $`git -C ${cwd} branch ${name} ${base}`.nothrow();
  if (p.exitCode !== 0) {
    const stderr = await p.stderr?.text?.();
    throw new Error(`git branch failed: ${stderr ?? ''}`);
  }
}

export async function addWorktree(dir: string, branch: string, cwd = process.cwd()): Promise<void> {
  await fs.mkdir(path.dirname(dir), {recursive: true});
  const p = await $`git -C ${cwd} worktree add --no-checkout ${dir} ${branch}`.nothrow();
  if (p.exitCode !== 0) {
    const stderr = await p.stderr?.text?.();
    throw new Error(`git worktree add failed: ${stderr ?? ''}`);
  }
}
