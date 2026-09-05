import { neon } from '@neondatabase/serverless';

if (!process.env.KITCHEN_DATABASE_URL) {
  // Fail loudly at import rather than rendering an empty cookbook, which would read as "you have
  // no dishes" instead of "the database is unreachable".
  throw new Error('KITCHEN_DATABASE_URL is not set');
}

export const sql = neon(process.env.KITCHEN_DATABASE_URL);
