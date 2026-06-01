import pg from "pg";

const { Pool } = pg;

// Read database environment variables, fall back to docker-compose defaults
export const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "52archive",
  user: process.env.PGUSER || "52archive",
  password: process.env.PGPASSWORD || "52archive",
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    // Log queries in debug environment if needed
    return res;
  } catch (error) {
    console.error("Database query error:", { text, error });
    throw error;
  }
}

// Clean shutdown utility
export async function closePool(): Promise<void> {
  await pool.end();
}
