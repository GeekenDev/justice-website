#!/usr/bin/env node
import { Client } from "pg";

function parseSsl(connectionString) {
  try {
    const url = new URL(connectionString);
    const sslMode = (url.searchParams.get("sslmode") || "").toLowerCase();
    if (sslMode === "disable") {
      return false;
    }
    if (sslMode === "require" || sslMode === "prefer" || sslMode === "allow") {
      return { rejectUnauthorized: false };
    }
  } catch {
    // Fall back to permissive SSL for managed Postgres providers.
  }
  return { rejectUnauthorized: false };
}

function getConnectionString() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing POSTGRES_URL (or DATABASE_URL) environment variable.");
  }
  return connectionString;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const connectionString = getConnectionString();
  const client = new Client({
    connectionString,
    ssl: parseSsl(connectionString),
  });

  await client.connect();
  try {
    const mismatchResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM files c
      JOIN files p
        ON p.efta_id = c.parent_efta_id
      WHERE c.parent_efta_id IS NOT NULL
        AND btrim(c.parent_efta_id) <> ''
        AND c.deleted IS DISTINCT FROM p.deleted
    `,
    );
    const mismatchCount = Number(mismatchResult.rows[0]?.count || 0);
    console.log(`Mismatched children before sync: ${mismatchCount}`);

    if (dryRun) {
      console.log("Dry run complete. No rows were updated.");
      return;
    }

    await client.query("BEGIN");
    const updateResult = await client.query(
      `
      UPDATE files AS c
      SET deleted = p.deleted
      FROM files AS p
      WHERE p.efta_id = c.parent_efta_id
        AND c.parent_efta_id IS NOT NULL
        AND btrim(c.parent_efta_id) <> ''
        AND c.deleted IS DISTINCT FROM p.deleted
    `,
    );

    const verifyResult = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM files c
      JOIN files p
        ON p.efta_id = c.parent_efta_id
      WHERE c.parent_efta_id IS NOT NULL
        AND btrim(c.parent_efta_id) <> ''
        AND c.deleted IS DISTINCT FROM p.deleted
    `,
    );
    await client.query("COMMIT");

    const remaining = Number(verifyResult.rows[0]?.count || 0);
    console.log(`Rows updated: ${updateResult.rowCount || 0}`);
    console.log(`Mismatched children after sync: ${remaining}`);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // noop
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
