import { Pool, PoolConfig } from 'pg';
import { v4 } from 'uuid';

import { IStorageClientFactory } from 'inladajs';

import { logger } from 'inlada-logger';
import { ITransactionProcessor, ITransactionService } from 'inlada-transaction-processor';
import { IStorageClient } from 'inladajs/dist/interfaces/storage';
import { PGQueryFunction } from '../interfaces/queryFunction';
import { IPGClient, IPGPoolClient } from '../interfaces/pg';

const begin = (client: IPGPoolClient) => async () => {
  logger.debug(null, `${client.cInfo?.id} Begin`);
  await client.query('BEGIN');
};

const query = (client: IPGPoolClient): PGQueryFunction => async (q, params) => {
  try {
    logger.debug(null, `pg query ${client.cInfo?.id} ${q} ${params}`);
    const result = await client.query(q, params || []);

    logger.debug(null, `pg storage ${client.cInfo?.id} rows: ${result.rows}`);

    return result;
  } catch (e: unknown) {
    logger.error(null, (e as {stack: unknown}).stack);
    logger.error(null, { id: client.cInfo?.id, q });
    logger.error(null, { id: client.cInfo?.id, params });

    const error = new Error(`Error on query ${client.cInfo?.id} ${q}, params: ${params}`);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    error.pgOrigin = e;
    throw error;
  }
};

const commit = (client: IPGPoolClient) => async () => {
  logger.debug(null, `${client.cInfo?.id} Commit`);
  await client.query('COMMIT');
};

const release = (client: IPGPoolClient) => async () => {
  await client.release();
};

const rollback = (client: IPGPoolClient) => async () => {
  try {
    logger.debug(null, `${client.cInfo?.id} ROLLBACK`);
    await client.query('ROLLBACK');
  } catch (err) {
    logger.error(null, `Error on pg rollback ${client.cInfo?.id} ${err}`);
  }
};

const finalize = (client: IPGPoolClient) => async () => {
  try {
    await client.release();
    logger.debug(`Connection ${client.cInfo?.id} released`);
  } catch (err) {
    logger.error(`Error on pg finalize ${client.cInfo?.id} ${err}`);
  }
};

// not all table columns
// todo add cache optionally
const getTableColumns = (client: IPGPoolClient) => async (tableName: string) => {
  const queryGetTableColumns = `SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' and table_name = $1 and (column_default is null or column_default not like '%(%)')`;
  const { rows } = await client.query(queryGetTableColumns, [tableName]);
  return (rows || []).map(r => r.column_name);
};

const getTableUniqueKey = (client: IPGPoolClient) => async (tableName: string): Promise<string> => {
  const queryUniqueKey = `
    SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS data_type
    FROM   pg_index i
    JOIN   pg_attribute a ON a.attrelid = i.indrelid
                        AND a.attnum = ANY(i.indkey)
    WHERE  i.indrelid = '${tableName}'::regclass
    AND    i.indisunique and not i.indisprimary`;
  const { rows } = await client.query(queryUniqueKey);
  return rows.map(r => r.attname).join(',');
};

const clientFabric = (client: IPGPoolClient): IPGClient => ({
  begin: begin(client), // todo split this to make begin-commit-rollback unavailable outside
  query: query(client),
  commit: commit(client),
  rollback: rollback(client),
  finalize: finalize(client),
  release: release(client),
  getTableColumns: getTableColumns(client),
  getTableUniqueKey: getTableUniqueKey(client),
});

let pool: Pool;
let first = true;

const initPool = async (settings: PoolConfig) => {
  if (first) {
    pool = new Pool(settings);
    first = false;
  }
};

const initInfo = (client: IPGPoolClient) => {
  if (!client.cInfo?.id) {
    // eslint-disable-next-line no-param-reassign
    client.cInfo = { id: v4() };
  }
};

const init = async (settings: PoolConfig) => {
  if (!pool) {
    await initPool(settings);
  }

  const client = await pool.connect() as IPGPoolClient;

  initInfo(client);
  client.on('notice', msg => logger.warning(null, `Pg notice ${client.cInfo?.id} ${msg.message}`));
  logger.debug(null, `Connection ${client.cInfo?.id} created`);
  return clientFabric(client);
};

const clients: Record<string, IPGClient> = {};

export const pgClientFactoryFactory = (settings: PoolConfig)
  : IStorageClientFactory => async (uid: string) => {
  if (!clients[uid]) {
    clients[uid] = await init(settings);
  }

  return clients[uid] as IStorageClient;
};

const clearUid = async (uid: string) => {
  if (clients[uid]) {
    await clients[uid].release();
    delete clients[uid];
  }
};

export const registerInTransactionService = (
  pgClientFactory: IStorageClientFactory,
  transactionProcessor: ITransactionProcessor,
) => {
  const pgTransaction: ITransactionService = {
    onStart: async uid => {
      const client = await pgClientFactory(uid);
      await client.begin();
    },
    onSuccess: async uid => {
      const client = await pgClientFactory(uid);
      await client.commit();
      await clearUid(uid);
    },
    onFail: async uid => {
      const client = await pgClientFactory(uid);
      await client.rollback();
      await clearUid(uid);
    },
  };

  transactionProcessor.registerTransactionService(pgTransaction);
};
