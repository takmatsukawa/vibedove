import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { projectStorageDir, repoIdentity } from "../config";

type Level = "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<Level, number> = {
	error: 40,
	warn: 30,
	info: 20,
	debug: 10,
};

function envLevel(): Level {
	const v = (process.env.VIBEDOVE_LOG_LEVEL || "info").toLowerCase();
	if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
	return "info";
}

async function ensureDir(p: string) {
	await fs.mkdir(p, { recursive: true });
}

async function resolveLogPath(cwd = process.cwd()): Promise<string> {
	try {
		const id = await repoIdentity(cwd);
		const dir = projectStorageDir(id);
		await ensureDir(dir);
		return path.join(dir, "vibedove.log");
	} catch {
		const fallback = path.join(os.homedir(), ".vibedove", "vibedove.log");
		await ensureDir(path.dirname(fallback));
		return fallback;
	}
}

async function write(line: string) {
	try {
		const file = await resolveLogPath();
		await fs.appendFile(file, line + "\n", "utf8");
	} catch {
		// swallow logging errors
	}
}

function nowISO() {
	return new Date().toISOString();
}

export async function log(
	level: Level,
	msg: string,
	meta?: Record<string, unknown>,
) {
	const min = LEVEL_ORDER[envLevel()];
	if (LEVEL_ORDER[level] < min) return;
	const payload =
		meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
	await write(`${nowISO()} ${level.toUpperCase()} ${msg}${payload}`);
}

export function logError(msg: string, meta?: Record<string, unknown>) {
	return log("error", msg, meta);
}
export function logWarn(msg: string, meta?: Record<string, unknown>) {
	return log("warn", msg, meta);
}
export function logInfo(msg: string, meta?: Record<string, unknown>) {
	return log("info", msg, meta);
}
export function logDebug(msg: string, meta?: Record<string, unknown>) {
	return log("debug", msg, meta);
}
