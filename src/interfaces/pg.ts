import { PoolClient } from 'pg';
import { PGQueryFunction } from './queryFunction';

export interface IPGClient {
  query: PGQueryFunction
  begin: () => Promise<void>
  commit: () => Promise<void>
  rollback: () => Promise<void>
  finalize: () => Promise<void>
  release: () => Promise<void>
  getTableColumns: (table: string) => Promise<string[]>
  getTableUniqueKey: (table: string) => Promise<string>
}

export interface IPGPoolClient extends PoolClient {
  cInfo: {
    id: string
  }
}
