import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {STATUSES} from '../constants';
import type {Board, Status, Task} from '../types';
import {loadBoard, saveBoard} from '../board';
import {shortId} from '../utils/id';
import {loadConfig, type Config, saveConfig, DEFAULTS} from '../config';

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
      if (input === 't') {
        if (!board || !grouped) return;
        const list = grouped[STATUSES[cursor.col]];
        if (!list.length) return;
        const task = list[Math.min(cursor.row, list.length - 1)];
        setEditingTitle({active: true, buf: task.title, original: task.title});
        return;
      }
      if (input === 'e') {
        if (!board || !grouped) return;
        const list = grouped[STATUSES[cursor.col]];
        if (!list.length) return;
        const task = list[Math.min(cursor.row, list.length - 1)];
        const buf = task.description ?? '';
        setEditingDesc({active: true, buf, original: buf});
        return;
      }

      if (key.escape || key.return) {
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
    if (input === 's') toast('Start task: not implemented yet');
    if (input === 'p') toast('PR create: not implemented yet');
    if (input === 'd') toast('Done: not implemented yet');
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
            <Text dimColor>(press t to edit, Enter save, Esc cancel)</Text>
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
          <Text dimColor>{editingDesc.active ? 'Enter save • Esc cancel' : 'Press e to edit description • Enter/Esc to close'}</Text>
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

// (inline editing helpers were replaced by ink-text-input for simplicity)

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
