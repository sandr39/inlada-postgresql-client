export interface IPGResult<T> {
  rows: T[]
}

export type PGQueryFunction = <T = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<IPGResult<T>>;
