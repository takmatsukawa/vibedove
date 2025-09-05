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
	// List of files/dirs to copy into new worktrees (relative to repo root)
	copyFiles: string[];
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
	copyFiles: [],
};

const GLOBAL_PATH = path.join(os.homedir(), ".vibedove", "config.json");

// Expose config file locations and strict loaders for editor-based editing
export function globalConfigPath(): string {
    return GLOBAL_PATH;
}

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

export async function ensureGlobalConfigFile(): Promise<string> {
    const file = GLOBAL_PATH;
    try {
        await fs.access(file);
    } catch {
        await saveConfig(DEFAULTS);
    }
    return file;
}

export async function loadConfigStrict(): Promise<Config> {
    const data = await fs.readFile(GLOBAL_PATH, "utf8");
    const parsed = JSON.parse(data);
    return { ...DEFAULTS, ...parsed } satisfies Config;
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
		const merged: any = { ...DEFAULT_PROJECT_CONFIG, ...parsed };
		// normalize copyFiles to a string[]; support string (whitespace/newline separated) or array
		if (Array.isArray(merged.copyFiles)) {
			merged.copyFiles = merged.copyFiles
				.map((v: unknown) => String(v).trim())
				.filter((v: string) => v.length > 0);
		} else if (typeof merged.copyFiles === "string") {
			merged.copyFiles = merged.copyFiles
				.split(/[\s\n\r\t]+/g)
				.map((v: string) => v.trim())
				.filter((v: string) => v.length > 0);
		} else {
			merged.copyFiles = [];
		}
		return merged satisfies ProjectConfig;
	} catch {
		return DEFAULT_PROJECT_CONFIG;
	}
}

// Strict variant that surfaces JSON errors instead of swallowing them
export async function loadProjectConfigStrict(
    cwd = process.cwd(),
): Promise<ProjectConfig> {
    const resolvedId = await repoIdentity(cwd);
    const file = path.join(projectStorageDir(resolvedId), "config.json");
    const data = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(data);
    const merged: any = { ...DEFAULT_PROJECT_CONFIG, ...parsed };
    if (Array.isArray(merged.copyFiles)) {
        merged.copyFiles = merged.copyFiles
            .map((v: unknown) => String(v).trim())
            .filter((v: string) => v.length > 0);
    } else if (typeof merged.copyFiles === "string") {
        merged.copyFiles = merged.copyFiles
            .split(/[\s\n\r\t]+/g)
            .map((v: string) => v.trim())
            .filter((v: string) => v.length > 0);
    } else {
        merged.copyFiles = [];
    }
    return merged satisfies ProjectConfig;
}

export function projectStorageDir(repoRoot: string): string {
	return path.join(
		os.homedir(),
		".vibedove",
		"projects",
		sanitizePathForDir(repoRoot),
	);
}

export async function projectConfigPath(cwd = process.cwd()): Promise<string> {
    const resolvedId = await repoIdentity(cwd);
    return path.join(projectStorageDir(resolvedId), "config.json");
}

export async function ensureProjectConfigFile(
    cwd = process.cwd(),
): Promise<string> {
    const resolvedId = await repoIdentity(cwd);
    const dir = projectStorageDir(resolvedId);
    await ensureDir(dir);
    const file = path.join(dir, "config.json");
    try {
        await fs.access(file);
    } catch {
        await fs.writeFile(
            file,
            JSON.stringify(DEFAULT_PROJECT_CONFIG, null, 2),
            "utf8",
        );
    }
    return file;
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
