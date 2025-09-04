import { $ } from "bun";
import { promises as fs } from "fs";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import path from "path";
import React, { useEffect, useMemo, useState } from "react";
import { loadBoard, saveBoard } from "../board";
import {
	type Config,
	loadConfig,
	loadProjectConfig,
	type ProjectConfig,
	resolveTmpRoot,
} from "../config";
import { STATUSES } from "../constants";
import {
	addWorktree,
	createBranch,
	currentBranch,
	deleteBranch,
	mergeBranch,
	removeWorktree,
} from "../git";
import type { Board, Status, Task } from "../types";
import { shortId } from "../utils/id";
import { logError, logInfo } from "../utils/log";
import { slugify } from "../utils/slug";

type Cursor = { col: number; row: number };

function Column({
	title,
	tasks,
	selected,
	active,
}: {
	title: string;
	tasks: Task[];
	selected: number;
	active: boolean;
}) {
	return (
		<Box flexDirection="column" width={28} marginRight={2}>
			<Text bold>{title}</Text>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor={active ? "green" : "gray"}
				paddingX={1}
				paddingY={0}
			>
				{tasks.length === 0 ? (
					<Text dimColor>— empty —</Text>
				) : (
					tasks.map((t, i) => (
						<Text
							key={t.id}
							color={i === selected ? "green" : undefined}
							inverse={i === selected}
						>
							{t.title}
						</Text>
					))
				)}
			</Box>
		</Box>
	);
}

function Help() {
	return (
		<>
			<Text>
				Keys: h/l(←/→) move columns • j/k(↑/↓) select • n new • s start • p PR •
				m merge+done (detail/In Progress) • d done • x cancel • r review (In Progress→In Review) • R refresh • ? help • q quit
			</Text>
		</>
	);
}

export function App() {
	const [board, setBoard] = useState<Board | null>(null);
	const [cursor, setCursor] = useState<Cursor>({ col: 0, row: 0 });
	const [showHelp, setShowHelp] = useState(false);
	const [config, setConfig] = useState<Config | null>(null);
    const [creating, setCreating] = useState<{
        active: boolean;
        focus: "title" | "desc";
        title: string;
        desc: string;
    }>({
        active: false,
        focus: "title",
        title: "",
        desc: "",
    });
	const [deleting, setDeleting] = useState<{
		active: boolean;
		task: Task | null;
	}>({ active: false, task: null });
	const [cancelling, setCancelling] = useState<{
		active: boolean;
		task: Task | null;
	}>({ active: false, task: null });
	const [merging, setMerging] = useState<{
		active: boolean;
		task: Task | null;
	}>({ active: false, task: null });
	const [inspecting, setInspecting] = useState<{
		active: boolean;
		task: Task | null;
	}>({ active: false, task: null });
	const [editChooser, setEditChooser] = useState(false);
	const [editingTitle, setEditingTitle] = useState<{
		active: boolean;
		buf: string;
		original: string;
	}>({
		active: false,
		buf: "",
		original: "",
	});
	const [editingDesc, setEditingDesc] = useState<{
		active: boolean;
		buf: string;
		original: string;
	}>({
		active: false,
		buf: "",
		original: "",
	});
	const [message, setMessage] = useState<string>("");
	const grouped = useMemo(() => (board ? group(board) : null), [board]);

	useEffect(() => {
		(async () => {
			setBoard(await loadBoard());
			setConfig(await loadConfig());
		})();
	}, []);

	useInput((input, key) => {
		if (input === "q") process.exit(0);
		if (input === "?") setShowHelp((v) => !v);

        // Creating mode (handled by TextInput components)
        if (creating.active) {
            if (key.escape) {
                setCreating({ active: false, focus: "title", title: "", desc: "" });
                return;
            }
            // Navigate between Title <-> Description with Tab / Shift+Tab
            if (key.tab && key.shift) {
                setCreating((s) => ({ ...s, focus: "title" }));
                return;
            }
            if (key.tab && !key.shift) {
                setCreating((s) => ({ ...s, focus: "desc" }));
                return;
            }
            return; // let TextInput handle typing & Enter
        }

		// Deleting confirm mode
		if (deleting.active) {
			if (key.escape || input === "n" || input === "N") {
				setDeleting({ active: false, task: null });
				return;
			}
			if (input === "y" || input === "Y") {
				const t = deleting.task;
				setDeleting({ active: false, task: null });
				if (t && board)
					void deleteTask(
						board,
						t,
						setBoard,
						setCursor,
						// Use task status column to keep UX consistent across views
						STATUSES.indexOf(t.status),
						setMessage,
					);
				return;
			}
			return; // ignore other keys while confirming
		}

			// Cancelling confirm mode
			if (cancelling.active) {
				if (key.escape || input === "n" || input === "N") {
					setCancelling({ active: false, task: null });
					return;
				}
				if (input === "y" || input === "Y") {
					const t = cancelling.task;
					setCancelling({ active: false, task: null });
					if (t && board)
						void cancelTask(
							board,
							t,
							setBoard,
							setInspecting,
							setCursor,
							setMessage,
						);
					return;
				}
				return; // ignore other keys while confirming
			}

		// Merging confirm mode
		if (merging.active) {
			if (key.escape || input === "n" || input === "N") {
				setMerging({ active: false, task: null });
				return;
			}
			if (input === "y" || input === "Y") {
				const t = merging.task;
				setMerging({ active: false, task: null });
				if (t && board)
					void mergeAndCompleteTask(
						board,
						t,
						setBoard,
						setInspecting,
						setCursor,
						setMessage,
					);
				return;
			}
			return; // ignore other keys while confirming
		}

		// Inspecting mode (floating detail)
		if (inspecting.active) {
			// Allow navigating tasks with hjkl/arrow keys while inspecting
			// Skip when editing title/description or chooser is active
			if (
				!editingTitle.active &&
				!editingDesc.active &&
				!editChooser &&
				grouped
			) {
				// Horizontal navigation: columns
				if (key.leftArrow || input === "h") {
					const nextCol = Math.max(0, cursor.col - 1);
					const list = grouped[STATUSES[nextCol]];
					if (list.length > 0) {
						const nextRow = Math.min(cursor.row, list.length - 1);
						setCursor({ col: nextCol, row: nextRow });
						setInspecting({ active: true, task: list[nextRow] });
					} else {
						// Move into an empty column: close detail automatically
						setCursor({ col: nextCol, row: 0 });
						setInspecting({ active: false, task: null });
					}
					return;
				}
				if (key.rightArrow || input === "l") {
					const nextCol = Math.min(STATUSES.length - 1, cursor.col + 1);
					const list = grouped[STATUSES[nextCol]];
					if (list.length > 0) {
						const nextRow = Math.min(cursor.row, list.length - 1);
						setCursor({ col: nextCol, row: nextRow });
						setInspecting({ active: true, task: list[nextRow] });
					} else {
						// Move into an empty column: close detail automatically
						setCursor({ col: nextCol, row: 0 });
						setInspecting({ active: false, task: null });
					}
					return;
				}

				// Vertical navigation: rows within the column
				if (key.upArrow || input === "k") {
					const list = grouped[STATUSES[cursor.col]];
					if (list.length > 0) {
						const nextRow = Math.max(
							0,
							Math.min(list.length - 1, cursor.row - 1),
						);
						setCursor({ col: cursor.col, row: nextRow });
						setInspecting({ active: true, task: list[nextRow] });
					}
					return;
				}
				if (key.downArrow || input === "j") {
					const list = grouped[STATUSES[cursor.col]];
					if (list.length > 0) {
						const nextRow = Math.max(
							0,
							Math.min(list.length - 1, cursor.row + 1),
						);
						setCursor({ col: cursor.col, row: nextRow });
						setInspecting({ active: true, task: list[nextRow] });
					}
					return;
				}
			}
			// Title editing
			if (editingTitle.active && inspecting.task) {
				if (key.escape) {
					setEditingTitle({ active: false, buf: "", original: "" });
				}
				return;
			}

			// Description editing
			if (editingDesc.active && inspecting.task) {
				if (key.escape) {
					setEditingDesc({ active: false, buf: "", original: "" });
				}
				return;
			}

			// Not editing: handle inspect controls
			if (key.delete || key.backspace) {
				if (!inspecting.task) return;
				setDeleting({ active: true, task: inspecting.task });
				return;
			}
			// Mark as Done from detail view
			if (input === "d") {
				if (!board || !inspecting.task) return;
				void completeTask(
					board,
					inspecting.task,
					setBoard,
					setInspecting,
					setCursor,
					setMessage,
				);
				return;
			}
			if (input === "s") {
				if (!board || !inspecting.task || !config) return;
				void startTask(
					board,
					inspecting.task,
					config,
					setBoard,
					setInspecting,
					setMessage,
					setCursor,
				).catch((e) => setMessage(String((e as any)?.message ?? e)));
				return;
			}
			if (input === "c") {
				if (!board || !inspecting.task) return;
				if (inspecting.task.status === "In Progress") {
					void changeTaskStatus(
						board,
						inspecting.task.id,
						"To Do",
						setBoard,
						setCursor,
						setInspecting,
					);
				}
				return;
			}

			if (input === "m") {
				if (!board || !inspecting.task) return;
				const t = inspecting.task;
				if (t.status !== "In Progress") {
					setMessage("Merge is only available for In Progress tasks");
					return;
				}
				if (!t.branch || !t.baseBranch) {
					setMessage("Missing branch/baseBranch; cannot merge");
					return;
				}
				setMerging({ active: true, task: t });
				setMessage(
					`Merge ${t.branch} -> ${t.baseBranch} and delete worktree/branch? (y/N)`,
				);
				return;
			}

			if (input === "x") {
				if (!inspecting.task) return;
				const t = inspecting.task;
				setCancelling({ active: true, task: t });
				setMessage(
					`Cancel task "${t.title}" and remove worktree/delete branch? (y/N)`,
				);
				return;
			}
			if (input === "e") {
				setEditChooser(true);
				return;
			}

			if (input === "o") {
				if (!config) return;
				const dir = inspecting.task?.worktreePath || process.cwd();
				void openEditor(dir, config, setMessage);
				return;
			}

			// Move In Progress -> In Review when pressing 'r' in detail view; otherwise reload
			if (input === "r") {
				if (!board || !inspecting.task) return;
				if (inspecting.task.status === "In Progress") {
					void changeTaskStatus(
						board,
						inspecting.task.id,
						"In Review",
						setBoard,
						setCursor,
						setInspecting,
					);
				} else {
					void reload(setBoard, setConfig);
				}
				return;
			}

			if (key.escape) {
				if (editChooser) {
					setEditChooser(false);
					return;
				}
				setInspecting({ active: false, task: null });
			}
			if (key.return) {
				// Don't close detail while chooser or editors are active
				if (editChooser || editingTitle.active || editingDesc.active) return;
				setInspecting({ active: false, task: null });
			}
			return; // ignore other keys while inspecting
		}

		// Navigation
		if (key.leftArrow || input === "h")
			setCursor((c) => ({ ...c, col: Math.max(0, c.col - 1), row: 0 }));
		if (key.rightArrow || input === "l")
			setCursor((c) => ({
				...c,
				col: Math.min(STATUSES.length - 1, c.col + 1),
				row: 0,
			}));
		if (key.upArrow || input === "k")
			setCursor((c) => ({ ...c, row: Math.max(0, c.row - 1) }));
		if (key.downArrow || input === "j")
			setCursor((c) => ({ ...c, row: c.row + 1 }));

		// Actions
		if (input === "c") {
			// Also allow moving In Progress -> To Do from list view
			if (!board || !grouped) return;
			const list = grouped[STATUSES[cursor.col]];
			if (list.length === 0) return;
			const row = Math.min(cursor.row, list.length - 1);
			const task = list[row];
			if (task.status === "In Progress") {
				void changeTaskStatus(
					board,
					task.id,
					"To Do",
					setBoard,
					setCursor,
					setInspecting,
				);
			}
			return;
		}
		// 'r' moves In Progress -> In Review when a task is selected; otherwise refresh
		if (input === "r") {
			if (!board || !grouped) {
				reload(setBoard, setConfig);
				return;
			}
			const list = grouped[STATUSES[cursor.col]];
			if (list.length === 0) {
				reload(setBoard, setConfig);
				return;
			}
			const row = Math.min(cursor.row, list.length - 1);
			const target =
				inspecting.active && inspecting.task ? inspecting.task : list[row];
			if (target.status === "In Progress") {
				void changeTaskStatus(
					board,
					target.id,
					"In Review",
					setBoard,
					setCursor,
					setInspecting,
				);
			} else {
				reload(setBoard, setConfig);
			}
			return;
		}
		// 'R' always refreshes
        if (input === "R") reload(setBoard, setConfig);
        if (input === "n")
            setCreating({ active: true, focus: "title", title: "", desc: "" });
		if (input === "o") {
			if (!config) return;
			const list = grouped ? grouped[STATUSES[cursor.col]] : [];
			const selected =
				list && list.length
					? list[Math.min(cursor.row, list.length - 1)]
					: undefined;
			const targetTask =
				inspecting.active && inspecting.task ? inspecting.task : selected;
			const dir = targetTask?.worktreePath || process.cwd();
			void openEditor(dir, config, setMessage);
			return;
		}
		if (key.delete || key.backspace) {
			if (!board || !grouped) return;
			const list = grouped[STATUSES[cursor.col]];
			if (list.length === 0) return;
			const row = Math.min(cursor.row, list.length - 1);
			const task = list[row];
			setDeleting({ active: true, task });
			return;
		}
		// status move via < > removed; will be handled in detail view
		if (key.return) {
			if (!board || !grouped) return;
			const list = grouped[STATUSES[cursor.col]];
			if (list.length === 0) return;
			const row = Math.min(cursor.row, list.length - 1);
			const task = list[row];
			setInspecting({ active: true, task });
			return;
		}
		if (input === "s") {
			if (!board || !grouped || !config) return;
			const list = grouped[STATUSES[cursor.col]];
			if (list.length === 0) return;
			const row = Math.min(cursor.row, list.length - 1);
			const target =
				inspecting.active && inspecting.task ? inspecting.task : list[row];
			void startTask(
				board,
				target,
				config,
				setBoard,
				setInspecting,
				setMessage,
				setCursor,
			).catch((e) => setMessage(String(e?.message ?? e)));
			return;
		}
		if (input === "p") toast("PR create: not implemented yet");
		if (input === "d") {
			if (!board || !grouped) return;
			const list = grouped[STATUSES[cursor.col]];
			if (list.length === 0) return;
			const row = Math.min(cursor.row, list.length - 1);
			const target =
				inspecting.active && inspecting.task ? inspecting.task : list[row];
			void completeTask(
				board,
				target,
				setBoard,
				setInspecting,
				setCursor,
				setMessage,
			).catch((e) => setMessage(String(e?.message ?? e)));
			return;
		}
		if (input === "x") {
			if (!board || !grouped) return;
			const list = grouped[STATUSES[cursor.col]];
			if (list.length === 0) return;
			const row = Math.min(cursor.row, list.length - 1);
			const target =
				inspecting.active && inspecting.task ? inspecting.task : list[row];
			setCancelling({ active: true, task: target });
			setMessage(
				`Cancel task "${target.title}" and remove worktree/delete branch? (y/N)`,
			);
			return;
		}
	});

	if (!board || !grouped || !config)
		return <Text color="yellow">Loading board…</Text>;

	const cols = STATUSES.map((s) => grouped[s]);
	const safeRow = (list: Task[]) =>
		Math.min(Math.max(0, cursor.row), Math.max(0, list.length - 1));

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>Vibedove Board</Text>
			</Box>
			<Box>
				{STATUSES.map((s, i) => (
					<Column
						key={s}
						title={`${s} (${grouped[s].length})`}
						tasks={grouped[s]}
						selected={i === cursor.col ? safeRow(grouped[s]) : -1}
						active={i === cursor.col}
					/>
				))}
			</Box>
			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					cfg: prefix={config.branchPrefix} • remote={config.remoteName} • base=
					{config.defaultBaseBranch ?? "current"} • editor=
					{config.editor ?? "-"}
				</Text>
                {creating.active ? (
                    <Box flexDirection="column">
                        <Box>
                            <Text>New task title: </Text>
                            <TextInput
                                value={creating.title}
                                focus={creating.focus === "title"}
                                onChange={(v) => setCreating((s) => ({ ...s, title: v }))}
                                onSubmit={(v) => {
                                    const t = v.trim();
                                    if (!t.length) return; // keep focus until user types
                                    setCreating((s) => ({ ...s, focus: "desc" }));
                                }}
                            />
                            <Text dimColor>  Enter to continue • Esc to cancel • Tab to switch</Text>
                        </Box>
                        <Box>
                            <Text>Description (optional): </Text>
                            <TextInput
                                value={creating.desc}
                                focus={creating.focus === "desc"}
                                onChange={(v) => setCreating((s) => ({ ...s, desc: v }))}
                                onSubmit={async (v) => {
                                    const desc = v.trim();
                                    const title = creating.title.trim();
                                    if (!title.length) {
                                        setCreating((s) => ({ ...s, focus: "title" }));
                                        setMessage("Title is required");
                                        return;
                                    }
                                    if (board && title.length) {
                                        await addTask(board, title, desc || undefined, setBoard, setCursor);
                                    }
                                    setCreating({ active: false, focus: "title", title: "", desc: "" });
                                    setMessage("");
                                }}
                            />
                        </Box>
                        <Text dimColor>Enter on Description to submit • Esc to cancel • Tab/Shift+Tab to switch • Leave description empty to skip</Text>
                    </Box>
                ) : deleting.active && deleting.task ? (
					<Text>
						Delete task <Text color="red">"{deleting.task.title}"</Text>? (y/N)
					</Text>
				) : cancelling.active && cancelling.task ? (
					<Text>
						Cancel task <Text color="yellow">"{cancelling.task.title}"</Text> and remove worktree? (y/N)
					</Text>
				) : showHelp ? (
					<Help />
				) : (
					<Text dimColor>
						Press Enter to view details • n to create • ? for help • q to quit
					</Text>
				)}
			</Box>
			{message ? (
				<Box marginTop={1}>
					<Text dimColor>{message}</Text>
				</Box>
			) : null}
			{inspecting.active && inspecting.task ? (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor="cyan"
					paddingX={1}
					paddingY={0}
					marginTop={1}
				>
					<Text bold>Task Details</Text>
					<Text>
						ID: <Text color="cyan">{inspecting.task.id}</Text>
					</Text>
					<Box flexDirection="column">
						<Text>Title:</Text>
						{editingTitle.active ? (
							<TextInput
								value={editingTitle.buf}
								onChange={(v) => setEditingTitle((s) => ({ ...s, buf: v }))}
								onSubmit={(v) => {
									const newTitle = v.trim();
									setEditingTitle({ active: false, buf: "", original: "" });
									if (newTitle.length && board && inspecting.task) {
										void saveTitle(
											board,
											inspecting.task.id,
											newTitle,
											setBoard,
											setInspecting,
										);
									}
								}}
							/>
						) : (
							<Text>{inspecting.task.title}</Text>
						)}
						<Text dimColor>(press e to edit, Enter save, Esc cancel)</Text>
					</Box>
					<Text>
						Status: <Text>{inspecting.task.status}</Text>
					</Text>
					{inspecting.task.branch ? (
						<Text>
							Branch: <Text color="green">{inspecting.task.branch}</Text>
						</Text>
					) : null}
					{inspecting.task.worktreePath ? (
						<Text>
							Worktree:{" "}
							<Text color="green">{inspecting.task.worktreePath}</Text>
						</Text>
					) : null}
					<Text>Description:</Text>
					{editingDesc.active ? (
						<TextInput
							value={editingDesc.buf}
							onChange={(v) => setEditingDesc((s) => ({ ...s, buf: v }))}
							onSubmit={(v) => {
								const text = v;
								setEditingDesc({ active: false, buf: "", original: "" });
								if (board && inspecting.task)
									void saveDescription(
										board,
										inspecting.task.id,
										text,
										setBoard,
										setInspecting,
									);
							}}
						/>
					) : (
						<Text color="gray">
							{inspecting.task.description?.length
								? inspecting.task.description
								: "—"}
						</Text>
					)}
					<Text dimColor>
						{editingDesc.active
							? "Enter save • Esc cancel"
							: "Press e to edit • hjkl/arrow to switch • Enter/Esc to close"}
					</Text>
				</Box>
			) : null}
			{editChooser && inspecting.active && inspecting.task ? (
				<Box marginTop={1}>
					<SelectInput
						items={[
							{ label: "Edit Title", value: "title" },
							{ label: "Edit Description", value: "description" },
						]}
						onSelect={(item: any) => {
							setEditChooser(false);
							if (item.value === "title") {
								setEditingTitle({
									active: true,
									buf: inspecting.task!.title,
									original: inspecting.task!.title,
								});
							} else {
								setEditingDesc({
									active: true,
									buf: inspecting.task!.description ?? "",
									original: inspecting.task!.description ?? "",
								});
							}
						}}
					/>
				</Box>
			) : null}
		</Box>
	);
}

function group(board: Board): Record<Status, Task[]> {
	const out: Record<Status, Task[]> = {
		"To Do": [],
		"In Progress": [],
		"In Review": [],
		Done: [],
		Cancelled: [],
	};
	for (const t of board.tasks) out[t.status].push(t);
	return out;
}

function toast(_msg: string) {
	// For MVP skeleton we just noop; Ink doesn't have global toasts by default
}

async function reload(
	setBoard: (b: Board) => void,
	setConfig?: (c: Config) => void,
) {
	const [b, c] = await Promise.all([loadBoard(), loadConfig()]);
	setBoard(b);
	if (setConfig && c) setConfig(c);
}

async function openEditor(
	dir: string,
	cfg: Config,
	setMessage: (m: string) => void,
) {
	const editor = cfg.editor || process.env.EDITOR || null;
	if (!editor) {
		setMessage("No editor configured. Set config.editor or $EDITOR.");
		return;
	}
	try {
		const cmd = `${editor} ${dir}`;
		await $`bash -lc ${cmd}`.nothrow();
		setMessage(`Opened editor: ${editor} ${dir}`);
	} catch (e) {
		setMessage(`Failed to open editor: ${String((e as any)?.message ?? e)}`);
	}
}

async function addTask(
    board: Board,
    title: string,
    description: string | undefined,
    setBoard: (b: Board) => void,
    setCursor: (c: Cursor) => void,
) {
	const id = shortId(7);
	const now = new Date().toISOString();
    const task: Task = {
        id,
        title,
        description: description && description.length ? description : undefined,
        status: "To Do",
        createdAt: now,
        updatedAt: now,
    };
	const next: Board = { ...board, tasks: [...board.tasks, task] };
	await saveBoard(next);
	setBoard(next);
	// move cursor to To Do column and select last item
	const col = STATUSES.indexOf("To Do");
	setCursor({
		col,
		row: Math.max(0, next.tasks.filter((t) => t.status === "To Do").length - 1),
	});
}

async function moveTaskStatus(
	board: Board,
	taskId: string,
	status: Status,
	setBoard: (b: Board) => void,
	setCursor: (c: Cursor) => void,
	toColIndex: number,
) {
	const now = new Date().toISOString();
	const next: Board = {
		...board,
		tasks: board.tasks.map((t) =>
			t.id === taskId ? { ...t, status, updatedAt: now } : t,
		),
	};
	await saveBoard(next);
	setBoard(next);
	// move cursor to the destination column, keep row within bounds
	const col = toColIndex;
	const rows = next.tasks.filter((t) => t.status === STATUSES[col]).length;
	setCursor((c) => ({ col, row: Math.min(c.row, Math.max(0, rows - 1)) }));
}

async function saveTitle(
	board: Board,
	taskId: string,
	title: string,
	setBoard: (b: Board) => void,
	setInspecting: (s: { active: boolean; task: Task | null }) => void,
) {
	const now = new Date().toISOString();
	const next: Board = {
		...board,
		tasks: board.tasks.map((t) =>
			t.id === taskId ? { ...t, title, updatedAt: now } : t,
		),
	};
	await saveBoard(next);
	setBoard(next);
	// Keep inspecting open and update task reference
	const updated = next.tasks.find((t) => t.id === taskId) ?? null;
	setInspecting({ active: true, task: updated });
}

async function saveDescription(
	board: Board,
	taskId: string,
	description: string,
	setBoard: (b: Board) => void,
	setInspecting: (s: { active: boolean; task: Task | null }) => void,
) {
	const now = new Date().toISOString();
	const next: Board = {
		...board,
		tasks: board.tasks.map((t) =>
			t.id === taskId ? { ...t, description, updatedAt: now } : t,
		),
	};
	await saveBoard(next);
	setBoard(next);
	const updated = next.tasks.find((t) => t.id === taskId) ?? null;
	setInspecting({ active: true, task: updated });
}

async function changeTaskStatus(
	board: Board,
	taskId: string,
	status: Status,
	setBoard: (b: Board) => void,
	setCursor: (c: Cursor) => void,
	setInspecting: (s: { active: boolean; task: Task | null }) => void,
) {
	const now = new Date().toISOString();
	const next: Board = {
		...board,
		tasks: board.tasks.map((t) =>
			t.id === taskId ? { ...t, status, updatedAt: now } : t,
		),
	};
	await saveBoard(next);
	setBoard(next);
	const col = STATUSES.indexOf(status);
	const inCol = next.tasks.filter((t) => t.status === status);
	const row = Math.max(
		0,
		inCol.findIndex((t) => t.id === taskId),
	);
	setCursor({ col, row });
	const updated = next.tasks.find((t) => t.id === taskId) ?? null;
	setInspecting({ active: true, task: updated });
}

// (inline editing helpers were replaced by ink-text-input for simplicity)

async function startTask(
	board: Board,
	task: Task,
	cfg: Config,
	setBoard: (b: Board) => void,
	setInspecting: (s: { active: boolean; task: Task | null }) => void,
	setMessage: (m: string) => void,
	setCursor: (c: Cursor) => void,
) {
	if (task.status !== "To Do") {
		setMessage("Start is only available from To Do");
		return;
	}
	const slug = slugify(task.title);
	const branch = `${cfg.branchPrefix}/task/${task.id}-${slug}`;
	const base = cfg.defaultBaseBranch ?? (await currentBranch());
	const wtDir = path.join(
		resolveTmpRoot(cfg),
		`${cfg.branchPrefix}-${task.id}-${slug}`,
	);

	// debug removed

	await createBranch(branch, base);
	await addWorktree(wtDir, branch);
	void logInfo("startTask.start", {
		id: task.id,
		title: task.title,
		branch,
		base,
		wtDir,
	});

	// Copy configured files/dirs, then run per-project setup script if configured
	let setupNote: string | null = null;
	let copyNote: string | null = null;
	try {
		const pcfg: ProjectConfig = await loadProjectConfig();
		// Copy files first so setup can rely on them (e.g., .env)
		if (pcfg.copyFiles && pcfg.copyFiles.length > 0) {
			const repoRoot = process.cwd();
			const errors: string[] = [];
			for (const rel of pcfg.copyFiles) {
				const trimmed = rel.trim();
				if (!trimmed) continue;
				if (path.isAbsolute(trimmed)) {
					errors.push(`skip absolute: ${trimmed}`);
					continue;
				}
				const src = path.resolve(repoRoot, trimmed);
				const dest = path.resolve(wtDir, trimmed);
				try {
					await copyRecursive(src, dest);
					void logInfo("startTask.copy.ok", { id: task.id, src, dest });
				} catch (e) {
					const msg = String((e as any)?.message ?? e);
					errors.push(`${trimmed}: ${msg}`);
					void logError("startTask.copy.fail", { id: task.id, src, dest, error: msg });
				}
			}
			if (errors.length) copyNote = `copy issues: ${errors.join("; ")}`;
		}

		if (pcfg.setupScript && pcfg.setupScript.trim().length > 0) {
			// Execute inside the new worktree directory
			const cmd = `cd "${wtDir}" && ${pcfg.setupScript}`;
			void logInfo("startTask.setup.start", { id: task.id, cmd });
			const proc = await $`bash -lc ${cmd}`.nothrow();
			if (proc.exitCode !== 0) {
				const stderr =
					(await proc.stderr?.text?.()) || (await proc.stdout?.text?.()) || "";
				setupNote = `setup failed: ${stderr.trim()}`;
				void logError("startTask.setup.fail", {
					id: task.id,
					exitCode: proc.exitCode,
					stderr: stderr.trim(),
				});
			} else {
				setupNote = "setup OK";
				void logInfo("startTask.setup.ok", {
					id: task.id,
					exitCode: proc.exitCode,
				});
			}
		}
	} catch (e) {
		setupNote = `setup error: ${String((e as any)?.message ?? e)}`;
		void logError("startTask.setup.exception", {
			id: task.id,
			error: String((e as any)?.message ?? e),
		});
	}

	const now = new Date().toISOString();
	const next: Board = {
		...board,
		tasks: board.tasks.map((t) =>
			t.id === task.id
				? {
						...t,
						status: "In Progress",
						branch,
						worktreePath: wtDir,
						baseBranch: base,
						updatedAt: now,
					}
				: t,
		),
	};
	await saveBoard(next);
	setBoard(next);
	const updated = next.tasks.find((t) => t.id === task.id) ?? null;
	setInspecting({ active: true, task: updated });
	// Move selection to In Progress column on the updated task
	const col = STATUSES.indexOf("In Progress");
	const inProg = next.tasks.filter((t) => t.status === "In Progress");
	const row = Math.max(
		0,
		inProg.findIndex((t) => t.id === task.id),
	);
	setCursor({ col, row });
	const notes: string[] = [];
	if (copyNote) notes.push(copyNote);
	if (setupNote) notes.push(setupNote);
	const note = notes.length ? ` • ${notes.join(" • ")}` : "";
	setMessage(`Started ${task.id} on ${branch}${note}`);
}

async function copyRecursive(src: string, dest: string): Promise<void> {
	const st = await fs.stat(src).catch(() => null);
	if (!st) throw new Error("not found");
	if (st.isDirectory()) {
		await fs.mkdir(dest, { recursive: true });
		const entries = await fs.readdir(src, { withFileTypes: true });
		for (const ent of entries) {
			const s = path.join(src, ent.name);
			const d = path.join(dest, ent.name);
			if (ent.isDirectory()) await copyRecursive(s, d);
			else if (ent.isFile()) await copyFileEnsuringDir(s, d);
		}
	} else if (st.isFile()) {
		await copyFileEnsuringDir(src, dest);
	}
}

async function copyFileEnsuringDir(src: string, dest: string): Promise<void> {
	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.copyFile(src, dest);
}

async function deleteTask(
	board: Board,
	task: Task,
	setBoard: (b: Board) => void,
	setCursor: (c: Cursor) => void,
	colIndex: number,
	setMessage: (m: string) => void,
) {
	// Attempt to remove worktree and branch if present
	const notes: string[] = [];
	if (task.worktreePath) {
		try {
			await removeWorktree(task.worktreePath);
		} catch (e) {
			notes.push(`worktree remove failed: ${String((e as any)?.message ?? e)}`);
		}
	}
	if (task.branch) {
		try {
			await deleteBranch(task.branch);
		} catch (e) {
			notes.push(`branch delete failed: ${String((e as any)?.message ?? e)}`);
		}
	}

	const next: Board = {
		...board,
		tasks: board.tasks.filter((t) => t.id !== task.id),
	};
	await saveBoard(next);
	setBoard(next);
	const rows = next.tasks.filter((t) => t.status === STATUSES[colIndex]).length;
	setCursor((c) => ({
		col: colIndex,
		row: Math.min(c.row, Math.max(0, rows - 1)),
	}));
	setMessage(
		notes.length
			? `Deleted ${task.id} (${notes.join(" • ")})`
			: `Deleted ${task.id}`,
	);
}

async function completeTask(
	board: Board,
	task: Task,
	setBoard: (b: Board) => void,
	setInspecting: (s: { active: boolean; task: Task | null }) => void,
	setCursor: (c: Cursor) => void,
	setMessage: (m: string) => void,
) {
	// Remove worktree if exists per spec
	if (task.worktreePath) {
		try {
			await removeWorktree(task.worktreePath);
		} catch (e) {
			setMessage(
				`Failed to remove worktree: ${String((e as any)?.message ?? e)}`,
			);
		}
	}

	const now = new Date().toISOString();
	const next: Board = {
		...board,
		tasks: board.tasks.map((t) =>
			t.id === task.id
				? { ...t, status: "Done", worktreePath: undefined, updatedAt: now }
				: t,
		),
	};
	await saveBoard(next);
	setBoard(next);
	const col = STATUSES.indexOf("Done");
	const inCol = next.tasks.filter((t) => t.status === "Done");
	const row = Math.max(
		0,
		inCol.findIndex((t) => t.id === task.id),
	);
	setCursor({ col, row });
	const updated = next.tasks.find((t) => t.id === task.id) ?? null;
	setInspecting({ active: true, task: updated });
	setMessage(`Marked ${task.id} as Done`);
}

async function cancelTask(
    board: Board,
    task: Task,
    setBoard: (b: Board) => void,
    setInspecting: (s: { active: boolean; task: Task | null }) => void,
    setCursor: (c: Cursor) => void,
    setMessage: (m: string) => void,
): Promise<void> {
    // Remove worktree if exists per spec
    if (task.worktreePath) {
        try {
            await removeWorktree(task.worktreePath);
        } catch (e) {
            setMessage(`Failed to remove worktree: ${String((e as any)?.message ?? e)}`);
        }
    }

    // Try to delete the local branch if present
    let branchDeleteNote = "";
    if (task.branch) {
        try {
            const cur = await currentBranch();
            if (cur === task.branch) {
                if (task.baseBranch) {
                    await $`git checkout ${task.baseBranch}`.nothrow();
                } else {
                    await $`git checkout --detach`.nothrow();
                }
            }
            await deleteBranch(task.branch);
        } catch (e) {
            branchDeleteNote = ` • branch delete failed: ${String((e as any)?.message ?? e)}`;
        }
    }

    const now = new Date().toISOString();
    const next: Board = {
        ...board,
        tasks: board.tasks.map((t) =>
            t.id === task.id
                ? { ...t, status: "Cancelled", worktreePath: undefined, branch: undefined, updatedAt: now }
                : t,
        ),
    };
    await saveBoard(next);
    setBoard(next);
    const col = STATUSES.indexOf("Cancelled");
    const inCol = next.tasks.filter((t) => t.status === "Cancelled");
    const row = Math.max(0, inCol.findIndex((t) => t.id === task.id));
    setCursor({ col, row });
    const updated = next.tasks.find((t) => t.id === task.id) ?? null;
    setInspecting({ active: true, task: updated });
    setMessage(`Marked ${task.id} as Cancelled, removed worktree and deleted branch${branchDeleteNote}`);
}

async function mergeAndCompleteTask(
	board: Board,
	task: Task,
	setBoard: (b: Board) => void,
	setInspecting: (s: { active: boolean; task: Task | null }) => void,
	setCursor: (c: Cursor) => void,
	setMessage: (m: string) => void,
) {
	if (!task.branch || !task.baseBranch) {
		setMessage("Missing branch/baseBranch; cannot merge");
		return;
	}

	try {
		await mergeBranch(task.baseBranch, task.branch);
	} catch (e) {
		setMessage(`Merge failed: ${String((e as any)?.message ?? e)}`);
		return;
	}

	// After successful merge, remove worktree and delete branch
	if (task.worktreePath) {
		try {
			await removeWorktree(task.worktreePath);
		} catch (e) {
			// Non-fatal; continue marking as Done
			setMessage(
				`Merged, but failed to remove worktree: ${String((e as any)?.message ?? e)}`,
			);
		}
	}

	// Ensure we are not on the branch to be deleted
	try {
		const cur = await currentBranch();
		if (cur === task.branch && task.baseBranch) {
			await $`git checkout ${task.baseBranch}`.nothrow();
		}
	} catch {
		// ignore; deletion might still succeed
	}

	// Try to delete the local branch
	let branchDeleteNote = "";
	if (task.branch) {
		try {
			await deleteBranch(task.branch);
		} catch (e) {
			branchDeleteNote = ` • branch delete failed: ${String((e as any)?.message ?? e)}`;
		}
	}

	const now = new Date().toISOString();
	const next: Board = {
		...board,
		tasks: board.tasks.map((t) =>
			t.id === task.id
				? {
						...t,
						status: "Done",
						worktreePath: undefined,
						branch: undefined,
						updatedAt: now,
					}
				: t,
		),
	};
	await saveBoard(next);
	setBoard(next);
	const col = STATUSES.indexOf("Done");
	const inCol = next.tasks.filter((t) => t.status === "Done");
	const row = Math.max(
		0,
		inCol.findIndex((t) => t.id === task.id),
	);
	setCursor({ col, row });
	const updated = next.tasks.find((t) => t.id === task.id) ?? null;
	setInspecting({ active: true, task: updated });
	setMessage(
		`Merged ${task.branch} into ${task.baseBranch}, removed worktree and deleted branch${branchDeleteNote}`,
	);
}
