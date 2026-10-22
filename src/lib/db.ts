import 'server-only'
import postgres from 'postgres'
import { databaseUrl } from './env'

type Sql = ReturnType<typeof postgres>
export type Tx = postgres.TransactionSql

const globalForDb = globalThis as unknown as { upNextSql?: Sql }

function connect(): Sql {
  return postgres(databaseUrl(), {
    // Works with Supabase's transaction pooler (port 6543), which can't use prepared statements.
    prepare: false,
    max: process.env.NODE_ENV === 'production' ? 3 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  })
}

export function db(): Sql {
  if (!globalForDb.upNextSql) globalForDb.upNextSql = connect()
  return globalForDb.upNextSql
}

/**
 * Runs queries as a signed-in player. Inside the transaction, auth.uid() returns this
 * player, exactly as it does for requests through Supabase, so the database functions
 * apply blind scoring and membership checks for them.
 */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
  return db().begin(async (tx) => {
    await tx`
      select set_config('request.jwt.claim.sub', ${userId}, true),
             set_config('request.jwt.claims', ${claims}, true)
    `
    return fn(tx)
  }) as Promise<T>
}

export function isPostgresError(e: unknown): e is postgres.PostgresError {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'PostgresError'
}
