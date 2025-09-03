import { $ } from "bun";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

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
	branchPrefix: "vd",
	defaultBaseBranch: null,
	tmpRoot: null,
	remoteName: "origin",
	editor: process.env.EDITOR ?? null,
};

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
	setupScript: null,
};

const GLOBAL_PATH = path.join(os.homedir(), ".vibedove", "config.json");

async function ensureDir(p: string) {
	await fs.mkdir(p, { recursive: true });
}

export async function loadConfig(createIfMissing = false): Promise<Config> {
	try {
		const data = await fs.readFile(GLOBAL_PATH, "utf8");
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
	await fs.writeFile(GLOBAL_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

export function resolveTmpRoot(cfg: Config): string {
	if (cfg.tmpRoot && cfg.tmpRoot.length > 0) return cfg.tmpRoot;
	const tmp = process.env.TMPDIR || os.tmpdir();
	return path.join(tmp, "vibedove", "worktrees");
}

// Per-project config lives alongside the board at ~/.vibedove/projects/<repo>/config.json
export async function loadProjectConfig(
	cwd = process.cwd(),
): Promise<ProjectConfig> {
	const resolvedId = await repoIdentity(cwd);
	const file = path.join(projectStorageDir(resolvedId), "config.json");
	try {
		const data = await fs.readFile(file, "utf8");
		const parsed = JSON.parse(data);
		return { ...DEFAULT_PROJECT_CONFIG, ...parsed } satisfies ProjectConfig;
	} catch {
		return DEFAULT_PROJECT_CONFIG;
	}
}

export function projectStorageDir(repoRoot: string): string {
	return path.join(
		os.homedir(),
		".vibedove",
		"projects",
		sanitizePathForDir(repoRoot),
	);
}

export async function repoIdentity(cwd: string): Promise<string> {
	// Use a worktree-stable identifier for per-project storage
	const common = await $`git -C ${cwd} rev-parse --git-common-dir`
		.quiet()
		.nothrow();
	if (common.exitCode === 0) {
		const raw = (await common.text()).trim();
		// Resolve relative paths (e.g., ".git") against repo toplevel
		if (path.isAbsolute(raw)) {
			const normalized =
				raw.endsWith(`${path.sep}.git`) || raw.endsWith(`.git`)
					? path.dirname(raw)
					: raw;
			return normalized;
		}
		const top = await $`git -C ${cwd} rev-parse --show-toplevel`
			.quiet()
			.nothrow();
		const base = top.exitCode === 0 ? (await top.text()).trim() : cwd;
		const resolved = path.join(base, raw);
		const normalized =
			resolved.endsWith(`${path.sep}.git`) || resolved.endsWith(`.git`)
				? path.dirname(resolved)
				: resolved;
		return normalized;
	}
	const top = await $`git -C ${cwd} rev-parse --show-toplevel`
		.quiet()
		.nothrow();
	if (top.exitCode === 0) {
		const t = (await top.text()).trim();
		return t;
	}
	return cwd;
}

function sanitizePathForDir(p: string): string {
	return p.replace(/[:/\\]/g, "_");
}
