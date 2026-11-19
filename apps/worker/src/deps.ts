import type { ModelAdapter, Semaphore } from '@jc/agents';
import type { Db } from '@jc/db';

export interface WorkerDeps {
  db: Db;
  adapter: ModelAdapter;
  sem: Semaphore;
  workerId: string;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  /** Overschrijfbaar in tests */
  heartbeatMs?: number;
  /** Duur van de zichtbare vergadering (sec) — alleen visueel venster, niet het verslag. */
  meetingVisualSec?: number;
  dailyBudgetUsd?: number;
}
