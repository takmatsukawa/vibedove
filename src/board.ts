import {promises as fs} from 'fs';
import path from 'path';
import {BOARD_PATH} from './constants';
import type {Board, Status, Task} from './types';

async function ensureDir(p: string) {
  await fs.mkdir(p, {recursive: true});
}

export async function loadBoard(cwd = process.cwd()): Promise<Board> {
  const file = path.join(cwd, BOARD_PATH);
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data) as Board;
  } catch {
    // initialize empty board
    const board: Board = {version: 1, tasks: []};
    await saveBoard(board, cwd);
    return board;
  }
}

export async function saveBoard(board: Board, cwd = process.cwd()): Promise<void> {
  const dir = path.dirname(path.join(cwd, BOARD_PATH));
  await ensureDir(dir);
  const file = path.join(cwd, BOARD_PATH);
  const json = JSON.stringify(board, null, 2);
  await fs.writeFile(file, json, 'utf8');
}

export function tasksByStatus(board: Board): Record<Status, Task[]> {
  const grouped = {
    'To Do': [] as Task[],
    'In Progress': [] as Task[],
    'In Review': [] as Task[],
    'Done': [] as Task[],
    'Cancelled': [] as Task[],
  } as Record<Status, Task[]>;
  for (const t of board.tasks) grouped[t.status].push(t);
  return grouped;
}

