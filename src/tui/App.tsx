import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import {STATUSES} from '../constants';
import type {Board, Status, Task} from '../types';
import {loadBoard, saveBoard} from '../board';
import {shortId} from '../utils/id';
import {loadConfig, type Config, saveConfig, DEFAULTS, resolveTmpRoot} from '../config';
import path from 'path';
import {createBranch, addWorktree, currentBranch, removeWorktree} from '../git';
import {slugify} from '../utils/slug';

type Cursor = {col: number; row: number};

function Column({title, tasks, selected}: {title: string; tasks: Task[]; selected: number}) {
  return (
    <Box flexDirection="column" width={28} marginRight={2}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
        {tasks.length === 0 ? (
          <Text dimColor>— empty —</Text>
        ) : (
          tasks.map((t, i) => (
            <Text key={t.id} color={i === selected ? 'green' : undefined} inverse={i === selected}>
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
        Keys: h/l(←/→) move columns • j/k(↑/↓) select • n new • s start • p PR • d done • x cancel • r refresh • ? help • q quit
      </Text>
    </>
  );
}

export function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [cursor, setCursor] = useState<Cursor>({col: 0, row: 0});
  const [showHelp, setShowHelp] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [creating, setCreating] = useState<{active: boolean; buf: string}>({active: false, buf: ''});
  const [deleting, setDeleting] = useState<{active: boolean; task: Task | null}>({active: false, task: null});
  const [inspecting, setInspecting] = useState<{active: boolean; task: Task | null}>({active: false, task: null});
  const [editChooser, setEditChooser] = useState(false);
  const [editingTitle, setEditingTitle] = useState<{active: boolean; buf: string; original: string}>({
    active: false,
    buf: '',
    original: '',
  });
  const [editingDesc, setEditingDesc] = useState<{active: boolean; buf: string; original: string}>({
    active: false,
    buf: '',
    original: '',
  });
  const [message, setMessage] = useState<string>('');
  const grouped = useMemo(() => (board ? group(board) : null), [board]);

  useEffect(() => {
    (async () => {
      setBoard(await loadBoard());
      setConfig(await loadConfig());
    })();
  }, []);

  useInput((input, key) => {
    if (input === 'q') process.exit(0);
    if (input === '?') setShowHelp((v) => !v);

    // Creating mode (simple inline input without extra deps)
    if (creating.active) {
      if (key.return) {
        const title = creating.buf.trim();
        setCreating({active: false, buf: ''});
        if (title.length > 0 && board) void addTask(board, title, setBoard, setCursor);
        return;
      }
      if (key.escape) {
        setCreating({active: false, buf: ''});
        return;
      }
      if (key.backspace || key.delete) {
        setCreating((s) => ({active: true, buf: s.buf.slice(0, -1)}));
        return;
      }
      if (input) {
        setCreating((s) => ({active: true, buf: s.buf + input}));
      }
      return; // don't process other keys while creating
    }

    // Deleting confirm mode
    if (deleting.active) {
      if (key.escape || input === 'n' || input === 'N') {
        setDeleting({active: false, task: null});
        return;
      }
      if (input === 'y' || input === 'Y') {
        const t = deleting.task;
        setDeleting({active: false, task: null});
        if (t && board) void deleteTask(board, t, setBoard, setCursor, cursor.col);
        return;
      }
      return; // ignore other keys while confirming
    }

    // Inspecting mode (floating detail)
    if (inspecting.active) {
      // Title editing
      if (editingTitle.active && inspecting.task) {
        if (key.escape) {
          setEditingTitle({active: false, buf: '', original: ''});
        }
        return;
      }

      // Description editing
      if (editingDesc.active && inspecting.task) {
        if (key.escape) {
          setEditingDesc({active: false, buf: '', original: ''});
        }
        return;
      }

      // Not editing: handle inspect controls
      if (input === '<') {
        if (!board || !grouped || !inspecting.task) return;
        const idx = STATUSES.indexOf(inspecting.task.status);
        const nextIdx = Math.max(0, idx - 1);
        const next = STATUSES[nextIdx];
        if (next !== inspecting.task.status) {
          void changeTaskStatus(board, inspecting.task.id, next, setBoard, setCursor, setInspecting);
        }
        return;
      }
      if (input === 't') {
        if (!board || !inspecting.task) return;
        if (inspecting.task.status === 'In Progress') {
          void changeTaskStatus(board, inspecting.task.id, 'To Do', setBoard, setCursor, setInspecting);
        }
        return;
      }
      if (input === 'e') {
        setEditChooser(true);
        return;
      }

      if (key.escape) {
        if (editChooser) {
          setEditChooser(false);
          return;
        }
        setInspecting({active: false, task: null});
      }
      if (key.return) {
        // Don't close detail while chooser or editors are active
        if (editChooser || editingTitle.active || editingDesc.active) return;
        setInspecting({active: false, task: null});
      }
      return; // ignore other keys while inspecting
    }

    // Navigation
    if (key.leftArrow || input === 'h') setCursor((c) => ({...c, col: Math.max(0, c.col - 1), row: 0}));
    if (key.rightArrow || input === 'l') setCursor((c) => ({...c, col: Math.min(STATUSES.length - 1, c.col + 1), row: 0}));
    if (key.upArrow || input === 'k') setCursor((c) => ({...c, row: Math.max(0, c.row - 1)}));
    if (key.downArrow || input === 'j') setCursor((c) => ({...c, row: c.row + 1}));

    // Actions
    if (input === 't') {
      // Also allow moving In Progress -> To Do from list view
      if (!board || !grouped) return;
      const list = grouped[STATUSES[cursor.col]];
      if (list.length === 0) return;
      const row = Math.min(cursor.row, list.length - 1);
      const task = list[row];
      if (task.status === 'In Progress') {
        void changeTaskStatus(board, task.id, 'To Do', setBoard, setCursor, setInspecting);
      }
      return;
    }
    if (input === 'r') reload(setBoard, setConfig);
    if (input === 'c') {
      // Generate ~/.vibedove/config.json with current or default values
      const cfg = config ?? DEFAULTS;
      void (async () => {
        await saveConfig(cfg);
        const reloaded = await loadConfig();
        setConfig(reloaded);
      })();
      return;
    }
    if (input === 'n') setCreating({active: true, buf: ''});
    if (key.delete || key.backspace) {
      if (!board || !grouped) return;
      const list = grouped[STATUSES[cursor.col]];
      if (list.length === 0) return;
      const row = Math.min(cursor.row, list.length - 1);
      const task = list[row];
      setDeleting({active: true, task});
      return;
    }
    // status move via < > removed; will be handled in detail view
    if (key.return) {
      if (!board || !grouped) return;
      const list = grouped[STATUSES[cursor.col]];
      if (list.length === 0) return;
      const row = Math.min(cursor.row, list.length - 1);
      const task = list[row];
      setInspecting({active: true, task});
      return;
    }
    if (input === 's') {
      if (!board || !grouped || !config) return;
      const list = grouped[STATUSES[cursor.col]];
      if (list.length === 0) return;
      const row = Math.min(cursor.row, list.length - 1);
      const target = inspecting.active && inspecting.task ? inspecting.task : list[row];
      void startTask(board, target, config, setBoard, setInspecting, setMessage, setCursor).catch((e) => setMessage(String(e?.message ?? e)));
      return;
    }
    if (input === 'p') toast('PR create: not implemented yet');
    if (input === 'd') {
      if (!board || !grouped) return;
      const list = grouped[STATUSES[cursor.col]];
      if (list.length === 0) return;
      const row = Math.min(cursor.row, list.length - 1);
      const target = inspecting.active && inspecting.task ? inspecting.task : list[row];
      void completeTask(board, target, setBoard, setInspecting, setCursor, setMessage).catch((e) => setMessage(String(e?.message ?? e)));
      return;
    }
    if (input === 'x') toast('Cancel: not implemented yet');
  });

  if (!board || !grouped || !config) return <Text color="yellow">Loading board…</Text>;

  const cols = STATUSES.map((s) => grouped[s]);
  const safeRow = (list: Task[]) => Math.min(Math.max(0, cursor.row), Math.max(0, list.length - 1));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Vibedove Board</Text>
      </Box>
      <Box>
        {STATUSES.map((s, i) => (
          <Column key={s} title={`${s} (${grouped[s].length})`} tasks={grouped[s]} selected={i === cursor.col ? safeRow(grouped[s]) : -1} />
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          cfg: prefix={config.branchPrefix} • remote={config.remoteName} • base={config.defaultBaseBranch ?? 'current'}
        </Text>
        {creating.active ? (
          <Text>
            New task title: <Text color="green">{creating.buf || ' '}</Text>
          </Text>
        ) : deleting.active && deleting.task ? (
          <Text>
            Delete task <Text color="red">"{deleting.task.title}"</Text>? (y/N)
          </Text>
        ) : showHelp ? (
          <Help />
        ) : (
          <>
            <Text dimColor>Press Enter to view details • n to create • ? for help • q to quit</Text>
            {grouped[STATUSES[cursor.col]].length > 0 ? (
              <Text dimColor>
                Desc preview: {(grouped[STATUSES[cursor.col]][Math.min(cursor.row, grouped[STATUSES[cursor.col]].length - 1)].description || '').split('\n')[0]}
              </Text>
            ) : (
              <Text dimColor>—</Text>
            )}
          </>
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
                onChange={(v) => setEditingTitle((s) => ({...s, buf: v}))}
                onSubmit={(v) => {
                  const newTitle = v.trim();
                  setEditingTitle({active: false, buf: '', original: ''});
                  if (newTitle.length && board && inspecting.task) {
                    void saveTitle(board, inspecting.task.id, newTitle, setBoard, setInspecting);
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
              Worktree: <Text color="green">{inspecting.task.worktreePath}</Text>
            </Text>
          ) : null}
          <Text>Description:</Text>
          {editingDesc.active ? (
            <TextInput
              value={editingDesc.buf}
              onChange={(v) => setEditingDesc((s) => ({...s, buf: v}))}
              onSubmit={(v) => {
                const text = v;
                setEditingDesc({active: false, buf: '', original: ''});
                if (board && inspecting.task) void saveDescription(board, inspecting.task.id, text, setBoard, setInspecting);
              }}
            />
          ) : (
            <Text color="gray">{inspecting.task.description?.length ? inspecting.task.description : '—'}</Text>
          )}
          <Text dimColor>{editingDesc.active ? 'Enter save • Esc cancel' : 'Press e to edit • Enter/Esc to close'}</Text>
        </Box>
      ) : null}
      {editChooser && inspecting.active && inspecting.task ? (
        <Box marginTop={1}>
          <SelectInput
            items={[
              {label: 'Edit Title', value: 'title'},
              {label: 'Edit Description', value: 'description'},
            ]}
            onSelect={(item: any) => {
              setEditChooser(false);
              if (item.value === 'title') {
                setEditingTitle({active: true, buf: inspecting.task!.title, original: inspecting.task!.title});
              } else {
                setEditingDesc({active: true, buf: inspecting.task!.description ?? '', original: inspecting.task!.description ?? ''});
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
    'To Do': [],
    'In Progress': [],
    'In Review': [],
    'Done': [],
    'Cancelled': [],
  };
  for (const t of board.tasks) out[t.status].push(t);
  return out;
}

function toast(_msg: string) {
  // For MVP skeleton we just noop; Ink doesn't have global toasts by default
}

async function reload(setBoard: (b: Board) => void, setConfig?: (c: Config) => void) {
  const [b, c] = await Promise.all([loadBoard(), loadConfig()]);
  setBoard(b);
  if (setConfig && c) setConfig(c);
}

async function addTask(board: Board, title: string, setBoard: (b: Board) => void, setCursor: (c: Cursor) => void) {
  const id = shortId(7);
  const now = new Date().toISOString();
  const task: Task = {
    id,
    title,
    status: 'To Do',
    createdAt: now,
    updatedAt: now,
  };
  const next: Board = {...board, tasks: [...board.tasks, task]};
  await saveBoard(next);
  setBoard(next);
  // move cursor to To Do column and select last item
  const col = STATUSES.indexOf('To Do');
  setCursor({col, row: Math.max(0, next.tasks.filter((t) => t.status === 'To Do').length - 1)});
}

async function moveTaskStatus(
  board: Board,
  taskId: string,
  status: Status,
  setBoard: (b: Board) => void,
  setCursor: (c: Cursor) => void,
  toColIndex: number
) {
  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    tasks: board.tasks.map((t) => (t.id === taskId ? {...t, status, updatedAt: now} : t)),
  };
  await saveBoard(next);
  setBoard(next);
  // move cursor to the destination column, keep row within bounds
  const col = toColIndex;
  const rows = next.tasks.filter((t) => t.status === STATUSES[col]).length;
  setCursor((c) => ({col, row: Math.min(c.row, Math.max(0, rows - 1))}));
}

async function saveTitle(
  board: Board,
  taskId: string,
  title: string,
  setBoard: (b: Board) => void,
  setInspecting: (s: {active: boolean; task: Task | null}) => void
) {
  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    tasks: board.tasks.map((t) => (t.id === taskId ? {...t, title, updatedAt: now} : t)),
  };
  await saveBoard(next);
  setBoard(next);
  // Keep inspecting open and update task reference
  const updated = next.tasks.find((t) => t.id === taskId) ?? null;
  setInspecting({active: true, task: updated});
}

async function saveDescription(
  board: Board,
  taskId: string,
  description: string,
  setBoard: (b: Board) => void,
  setInspecting: (s: {active: boolean; task: Task | null}) => void
) {
  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    tasks: board.tasks.map((t) => (t.id === taskId ? {...t, description, updatedAt: now} : t)),
  };
  await saveBoard(next);
  setBoard(next);
  const updated = next.tasks.find((t) => t.id === taskId) ?? null;
  setInspecting({active: true, task: updated});
}

async function changeTaskStatus(
  board: Board,
  taskId: string,
  status: Status,
  setBoard: (b: Board) => void,
  setCursor: (c: Cursor) => void,
  setInspecting: (s: {active: boolean; task: Task | null}) => void
) {
  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    tasks: board.tasks.map((t) => (t.id === taskId ? {...t, status, updatedAt: now} : t)),
  };
  await saveBoard(next);
  setBoard(next);
  const col = STATUSES.indexOf(status);
  const inCol = next.tasks.filter((t) => t.status === status);
  const row = Math.max(0, inCol.findIndex((t) => t.id === taskId));
  setCursor({col, row});
  const updated = next.tasks.find((t) => t.id === taskId) ?? null;
  setInspecting({active: true, task: updated});
}

// (inline editing helpers were replaced by ink-text-input for simplicity)

async function startTask(
  board: Board,
  task: Task,
  cfg: Config,
  setBoard: (b: Board) => void,
  setInspecting: (s: {active: boolean; task: Task | null}) => void,
  setMessage: (m: string) => void,
  setCursor: (c: Cursor) => void
) {
  if (task.status !== 'To Do') {
    setMessage('Start is only available from To Do');
    return;
  }
  const slug = slugify(task.title);
  const branch = `${cfg.branchPrefix}/task/${task.id}-${slug}`;
  const base = cfg.defaultBaseBranch ?? (await currentBranch());
  const wtDir = path.join(resolveTmpRoot(cfg), `${cfg.branchPrefix}-${task.id}-${slug}`);

  await createBranch(branch, base);
  await addWorktree(wtDir, branch);

  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === task.id ? {...t, status: 'In Progress', branch, worktreePath: wtDir, baseBranch: base, updatedAt: now} : t
    ),
  };
  await saveBoard(next);
  setBoard(next);
  const updated = next.tasks.find((t) => t.id === task.id) ?? null;
  setInspecting({active: true, task: updated});
  // Move selection to In Progress column on the updated task
  const col = STATUSES.indexOf('In Progress');
  const inProg = next.tasks.filter((t) => t.status === 'In Progress');
  const row = Math.max(0, inProg.findIndex((t) => t.id === task.id));
  setCursor({col, row});
  setMessage(`Started ${task.id} on ${branch}`);
}

async function deleteTask(board: Board, task: Task, setBoard: (b: Board) => void, setCursor: (c: Cursor) => void, colIndex: number) {
  const next: Board = {
    ...board,
    tasks: board.tasks.filter((t) => t.id !== task.id),
  };
  await saveBoard(next);
  setBoard(next);
  const rows = next.tasks.filter((t) => t.status === STATUSES[colIndex]).length;
  setCursor((c) => ({col: colIndex, row: Math.min(c.row, Math.max(0, rows - 1))}));
}

async function completeTask(
  board: Board,
  task: Task,
  setBoard: (b: Board) => void,
  setInspecting: (s: {active: boolean; task: Task | null}) => void,
  setCursor: (c: Cursor) => void,
  setMessage: (m: string) => void
) {
  // Remove worktree if exists per spec
  if (task.worktreePath) {
    try {
      await removeWorktree(task.worktreePath);
    } catch (e) {
      setMessage(`Failed to remove worktree: ${String((e as any)?.message ?? e)}`);
    }
  }

  const now = new Date().toISOString();
  const next: Board = {
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === task.id ? { ...t, status: 'Done', worktreePath: undefined, updatedAt: now } : t
    ),
  };
  await saveBoard(next);
  setBoard(next);
  const col = STATUSES.indexOf('Done');
  const inCol = next.tasks.filter((t) => t.status === 'Done');
  const row = Math.max(0, inCol.findIndex((t) => t.id === task.id));
  setCursor({col, row});
  const updated = next.tasks.find((t) => t.id === task.id) ?? null;
  setInspecting({active: true, task: updated});
  setMessage(`Marked ${task.id} as Done`);
}
