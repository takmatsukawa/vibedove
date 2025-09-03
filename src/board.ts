// board.json is stored per-repo under ~/.vibedove/projects/<repo>/board.json
import { $ } from "bun";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Board, Status, Task } from "./types";

async function ensureDir(p: string) {
	await fs.mkdir(p, { recursive: true });
}

export async function loadBoard(cwd = process.cwd()): Promise<Board> {
	const resolvedId = await repoIdentity(cwd);
	const file = sharedBoardPath(resolvedId);
	try {
		const data = await fs.readFile(file, "utf8");
		return JSON.parse(data) as Board;
	} catch {
		// Initialize empty board at shared location
		const board: Board = { version: 1, tasks: [] };
		await saveBoard(board, cwd);
		return board;
	}
}

export async function saveBoard(
	board: Board,
	cwd = process.cwd(),
): Promise<void> {
	const repoId = await repoIdentity(cwd);
	const json = JSON.stringify(board, null, 2);
	const file = sharedBoardPath(repoId);
	await ensureDir(path.dirname(file));
	await fs.writeFile(file, json, "utf8");
}

export function tasksByStatus(board: Board): Record<Status, Task[]> {
	const grouped = {
		"To Do": [] as Task[],
		"In Progress": [] as Task[],
		"In Review": [] as Task[],
		Done: [] as Task[],
		Cancelled: [] as Task[],
	} as Record<Status, Task[]>;
	for (const t of board.tasks) grouped[t.status].push(t);
	return grouped;
}

// Helpers to share board.json across git worktrees of the same repo
async function repoIdentity(cwd: string): Promise<string> {
	// Prefer a stable, absolute identifier shared across worktrees
	const common = await $`git -C ${cwd} rev-parse --git-common-dir`.nothrow();
	if (common.exitCode === 0) {
		const raw = (await common.text()).trim();
		const pathMod = require("path");
		if (pathMod.isAbsolute(raw)) {
			const normalized =
				raw.endsWith(`${pathMod.sep}.git`) || raw.endsWith(`.git`)
					? pathMod.dirname(raw)
					: raw;
			return normalized;
		}
		const top = await $`git -C ${cwd} rev-parse --show-toplevel`.nothrow();
		const base = top.exitCode === 0 ? (await top.text()).trim() : cwd;
		const resolved = pathMod.join(base, raw);
		const normalized =
			resolved.endsWith(`${pathMod.sep}.git`) || resolved.endsWith(`.git`)
				? pathMod.dirname(resolved)
				: resolved;
		return normalized;
	}

	// Fallback to repo toplevel (non-worktree or non-git directories)
	const top = await $`git -C ${cwd} rev-parse --show-toplevel`.nothrow();
	if (top.exitCode === 0) {
		const t = (await top.text()).trim();
		return t;
	}
	return cwd;
}

function sharedBoardPath(repoRoot: string): string {
	const safe = sanitizePathForDir(repoRoot);
	return path.join(os.homedir(), ".vibedove", "projects", safe, "board.json");
}

function sanitizePathForDir(p: string): string {
	// Replace path separators and characters that are problematic in folder names
	return p.replace(/[:/\\]/g, "_");
}
