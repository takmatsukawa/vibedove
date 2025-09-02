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
	const root = await repoTopLevel(cwd);
	const sharedPath = sharedBoardPath(root);

	// Use shared board at ~/.vibedove/projects/<project>/board.json
	try {
		const data = await fs.readFile(sharedPath, "utf8");
		return JSON.parse(data) as Board;
	} catch {}

	// Initialize empty board at shared location
	const board: Board = { version: 1, tasks: [] };
	await saveBoard(board, cwd);
	return board;
}

export async function saveBoard(
	board: Board,
	cwd = process.cwd(),
): Promise<void> {
	const root = await repoTopLevel(cwd);
	const json = JSON.stringify(board, null, 2);
	const file = sharedBoardPath(root);
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
async function repoTopLevel(cwd: string): Promise<string> {
	const p = await $`git -C ${cwd} rev-parse --show-toplevel`.nothrow();
	if (p.exitCode === 0) {
		const out = await p.text();
		return out.trim();
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
