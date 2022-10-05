## Postgres client

Pg wrapper for [inlada-transaction-service](https://github.com/sandr39/inlada-transaction-processor)

### Usage

#### Initialization
```typescript
import { transactionProcessor } from 'inlada-transaction-processor';
import { pgClientFactoryFactory, registerInTransactionService } from 'inlada-postgresql-client';
import { PoolConfig } from 'pg';

const clientParams: PoolConfig = {
  host: process.env.DB_HOST,
  port: +(process.env.DB_PORT || 0),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  idleTimeoutMillis: 0,
};

export const pgClientFactory = pgClientFactoryFactory(clientParams);
registerInTransactionService(pgClientFactory, transactionProcessor);
```
#### Query
```typescript
  const { rows } = await (await pgClientFactory(event.uid)).query(query, params);
```

`query` method is simply proxy to [pg.Client.query](https://node-postgres.com/api/client#clientquery)
