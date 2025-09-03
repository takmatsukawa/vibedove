import { $ } from "bun";
import { promises as fs } from "fs";
import path from "path";
import { logInfo } from "./utils/log";

export async function currentBranch(cwd = process.cwd()): Promise<string> {
	const out = await $`git -C ${cwd} rev-parse --abbrev-ref HEAD`.text();
	return out.trim();
}

export async function branchExists(
	name: string,
	cwd = process.cwd(),
): Promise<boolean> {
	const p = await $`git -C ${cwd} rev-parse --verify --quiet ${name}`.nothrow();
	return p.exitCode === 0;
}

export async function createBranch(
	name: string,
	base: string,
	cwd = process.cwd(),
): Promise<void> {
	if (await branchExists(name, cwd)) return;
	const p = await $`git -C ${cwd} branch ${name} ${base}`.nothrow();
	if (p.exitCode !== 0) {
		const stderr = await p.stderr?.text?.();
		throw new Error(`git branch failed: ${stderr ?? ""}`);
	}
	void logInfo("git.branch.create", { name, base, cwd });
}

export async function addWorktree(
	dir: string,
	branch: string,
	cwd = process.cwd(),
): Promise<void> {
	await fs.mkdir(path.dirname(dir), { recursive: true });
	// Create worktree and check out files for the given branch
	const p = await $`git -C ${cwd} worktree add ${dir} ${branch}`.nothrow();
	if (p.exitCode !== 0) {
		const stderr = await p.stderr?.text?.();
		throw new Error(`git worktree add failed: ${stderr ?? ""}`);
	}
	void logInfo("git.worktree.add", { dir, branch, cwd });
}

export async function removeWorktree(
	dir: string,
	cwd = process.cwd(),
): Promise<void> {
	await $`git -C ${cwd} worktree prune`.nothrow();
	const p = await $`git -C ${cwd} worktree remove ${dir} --force`.nothrow();
	if (p.exitCode !== 0) {
		// Fallback: force delete directory if git command failed
		await fs.rm(dir, { recursive: true, force: true });
	}
}

export async function deleteBranch(
	name: string,
	cwd = process.cwd(),
): Promise<void> {
	const p = await $`git -C ${cwd} branch -D ${name}`.nothrow();
	if (p.exitCode !== 0) {
		const stderr = await p.stderr?.text?.();
		throw new Error(`git branch -D failed: ${stderr ?? ""}`);
	}
}

export async function mergeBranch(
	base: string,
	head: string,
	cwd = process.cwd(),
): Promise<void> {
	const orig = await currentBranch(cwd);
	// Checkout base branch if not already on it
	if (orig !== base) {
		const co = await $`git -C ${cwd} checkout ${base}`.nothrow();
		if (co.exitCode !== 0) {
			const stderr = await co.stderr?.text?.();
			throw new Error(`git checkout ${base} failed: ${stderr ?? ""}`);
		}
	}

	// Try a non-ff merge with an auto message
	const m = await $`git -C ${cwd} merge --no-ff --no-edit ${head}`.nothrow();
	if (m.exitCode !== 0) {
		const stderr = await m.stderr?.text?.();
		// Attempt to abort merge to leave repo clean
		await $`git -C ${cwd} merge --abort`.nothrow();
		// Switch back if we changed branches
		if (orig !== base) await $`git -C ${cwd} checkout ${orig}`.nothrow();
		throw new Error(`git merge failed: ${stderr ?? ""}`);
	}

	// Switch back to original branch if needed
	if (orig !== base) {
		await $`git -C ${cwd} checkout ${orig}`.nothrow();
	}
	void logInfo("git.merge", { base, head, cwd });
}
