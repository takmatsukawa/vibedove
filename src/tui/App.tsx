import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {STATUSES} from '../constants';
import type {Board, Status, Task} from '../types';
import {loadBoard} from '../board';

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
  const grouped = useMemo(() => (board ? group(board) : null), [board]);

  useEffect(() => {
    (async () => setBoard(await loadBoard()))();
  }, []);

  useInput((input, key) => {
    if (key.escape || input === 'q') process.exit(0);
    if (input === '?') setShowHelp((v) => !v);

    // Navigation
    if (key.leftArrow || input === 'h') setCursor((c) => ({...c, col: Math.max(0, c.col - 1), row: 0}));
    if (key.rightArrow || input === 'l') setCursor((c) => ({...c, col: Math.min(STATUSES.length - 1, c.col + 1), row: 0}));
    if (key.upArrow || input === 'k') setCursor((c) => ({...c, row: Math.max(0, c.row - 1)}));
    if (key.downArrow || input === 'j') setCursor((c) => ({...c, row: c.row + 1}));

    // Placeholder actions
    if (input === 'r') reload(setBoard);
    if (input === 'n') toast('New task: not implemented yet');
    if (input === 's') toast('Start task: not implemented yet');
    if (input === 'p') toast('PR create: not implemented yet');
    if (input === 'd') toast('Done: not implemented yet');
    if (input === 'x') toast('Cancel: not implemented yet');
    if (input === '>' || input === '<') toast('Move status: not implemented yet');
  });

  if (!board || !grouped) return <Text color="yellow">Loading board…</Text>;

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
      <Box marginTop={1}>
        {showHelp ? <Help /> : <Text dimColor>Press ? for help • q to quit</Text>}
      </Box>
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

async function reload(setBoard: (b: Board) => void) {
  const b = await loadBoard();
  setBoard(b);
}

