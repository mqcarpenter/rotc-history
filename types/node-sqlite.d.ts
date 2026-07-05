// Minimal ambient types for Node's built-in `node:sqlite` module.
// The installed @types/node version predates Node's SQLite support, so we
// declare just enough surface area for this project's usage. Safe to delete
// once @types/node ships full coverage (22.5+).
declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
