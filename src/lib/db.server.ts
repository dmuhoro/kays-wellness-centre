import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

let sql: SqlClient | null = null;
let dbAvailable = false;
let connectionError: string | null = null;

export function getDb(): SqlClient {
  if (sql) return sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    dbAvailable = false;
    connectionError = "DATABASE_URL is not set";
    throw new Error(connectionError);
  }

  sql = postgres(url, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    onclose: () => {
      dbAvailable = false;
    },
  });

  dbAvailable = true;
  connectionError = null;
  return sql;
}

export function isDbAvailable(): boolean {
  return dbAvailable;
}

export function getConnectionError(): string | null {
  return connectionError;
}

export async function withDb<T>(
  fn: (db: SqlClient) => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    const db = getDb();
    return await fn(db);
  } catch (err) {
    dbAvailable = false;
    connectionError =
      err instanceof Error ? err.message : "Unknown database error";
    console.error("[DB] Connection failed, using fallback:", connectionError);
    return fallback();
  }
}

export async function ensureSchema(): Promise<boolean> {
  try {
    const db = getDb();
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS clinic_leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL DEFAULT '',
        email VARCHAR(255) NOT NULL DEFAULT '',
        service VARCHAR(100) NOT NULL DEFAULT '',
        channel VARCHAR(50) NOT NULL DEFAULT '',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        raw_payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return true;
  } catch (err) {
    console.error("[DB] Schema setup failed:", err);
    dbAvailable = false;
    return false;
  }
}
