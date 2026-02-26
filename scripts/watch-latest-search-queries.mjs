#!/usr/bin/env node
import { Client } from "pg";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_LIMIT = 10;

function parseArgs(argv) {
  const args = {
    intervalMs: DEFAULT_INTERVAL_MS,
    limit: DEFAULT_LIMIT,
    once: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === "--interval-ms" || arg === "--interval") && next) {
      args.intervalMs = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--limit" && next) {
      args.limit = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--once") {
      args.once = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Watch latest successful DOJ search queries every 30s.

Usage:
  node scripts/watch-latest-search-queries.mjs [options]

Options:
  --interval-ms <n>   Poll interval in milliseconds (default: 30000)
  --limit <n>         Number of latest queries to show (default: 10)
  --once              Run one poll and exit
  --help, -h          Show help

Connection env fallback order:
  POSTGRES_URL
  DATABASE_URL
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NO_CACHE
`);
}

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
    // Fall through to permissive SSL for managed Postgres.
  }
  return { rejectUnauthorized: false };
}

function getConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ||
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NO_CACHE ||
    ""
  ).trim();
}

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollLatestQueries(limit) {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("Missing DB connection string in environment.");
  }

  const client = new Client({
    connectionString,
    ssl: parseSsl(connectionString),
  });

  await client.connect();
  try {
    const result = await client.query(
      `
      SELECT
        query_text,
        hit_count,
        last_success_at::text AS last_success_at
      FROM doj_search_queries
      ORDER BY last_success_at DESC
      LIMIT $1
      `,
      [limit],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!Number.isFinite(args.intervalMs) || args.intervalMs <= 0) {
    throw new Error("--interval-ms must be a positive number.");
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    throw new Error("--limit must be a positive number.");
  }

  console.log(
    `[query-watch ${now()}] starting: intervalMs=${Math.floor(args.intervalMs)} limit=${Math.floor(args.limit)} once=${args.once}`,
  );

  let keepRunning = true;
  process.on("SIGINT", () => {
    keepRunning = false;
    console.log(`[query-watch ${now()}] stopping (SIGINT)`);
  });
  process.on("SIGTERM", () => {
    keepRunning = false;
    console.log(`[query-watch ${now()}] stopping (SIGTERM)`);
  });

  while (keepRunning) {
    try {
      const rows = await pollLatestQueries(Math.floor(args.limit));
      console.log(`[query-watch ${now()}] latest successful queries`);
      if (rows.length === 0) {
        console.log("  (no rows)");
      } else {
        rows.forEach((row, index) => {
          const hits = Number(row.hit_count) || 0;
          console.log(
            `  ${String(index + 1).padStart(2, " ")}. ${row.last_success_at} | hits=${hits} | ${row.query_text}`,
          );
        });
      }
    } catch (error) {
      console.error(`[query-watch ${now()}] error: ${String(error)}`);
    }

    if (args.once) {
      break;
    }
    await sleep(Math.floor(args.intervalMs));
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
