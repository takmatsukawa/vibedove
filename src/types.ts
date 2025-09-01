export type Status = 'To Do' | 'In Progress' | 'In Review' | 'Done' | 'Cancelled';

export type Task = {
  id: string;
  title: string;
  description?: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  branch?: string;
  worktreePath?: string;
  baseBranch?: string;
};

export type Board = {
  version: number;
  tasks: Task[];
};
