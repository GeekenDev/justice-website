#!/usr/bin/env node
import { Client } from "pg";

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_LIMIT = 250;

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function parseArgs(argv) {
  const args = {
    intervalMs: DEFAULT_INTERVAL_MS,
    limit: DEFAULT_LIMIT,
    replayLatest: false,
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
    if (arg === "--replay-latest") {
      args.replayLatest = true;
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
  console.log(`Watch query activity via DB polling (append-only tail style).

Usage:
  node scripts/watch-latest-search-queries.mjs [options]

Options:
  --interval-ms <n>   Poll interval in ms (default: 2000)
  --limit <n>         Rows fetched per poll (default: 250)
  --replay-latest     Print current latest rows once, then continue tailing
  --help, -h          Show help

Tracks:
  - DOJ search queries (doj_search_queries)
  - Advanced search queries (search_v2_queries)
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
    // fall through
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

function safeDateMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : 0;
}

function formatEventLabel(source) {
  return source === "advanced" ? "ADVANCED SEARCH" : "DOJSEARCH";
}

function colorEnabled() {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  return Boolean(process.stdout?.isTTY);
}

function paint(text, ...styles) {
  if (!colorEnabled() || styles.length === 0) {
    return text;
  }
  const prefix = styles.map((style) => ANSI[style] || "").join("");
  return `${prefix}${text}${ANSI.reset}`;
}

function formatHits(hits) {
  if (hits >= 20) {
    return paint(`hits=${hits}`, "bold", "red");
  }
  if (hits >= 5) {
    return paint(`hits=${hits}`, "bold", "yellow");
  }
  return paint(`hits=${hits}`, "bold", "green");
}

function formatQueryWatchRow({ source, queryText, hitCount, lastSuccessAt, delta }) {
  const prefix = paint(`[${now()}]`, "dim", "cyan");
  const labelColor = source === "advanced" ? "magenta" : "blue";
  const label = paint(formatEventLabel(source), "bold", labelColor);
  const query = paint(`"${queryText}"`, "bold", "yellow");
  const hits = formatHits(hitCount);
  const at = paint(`@ ${lastSuccessAt}`, "dim");
  const deltaText =
    typeof delta === "number" && delta > 0
      ? ` ${paint(`(+${delta})`, "green", "bold")}`
      : "";

  return `${prefix} ${label}: ${query} ${hits}${deltaText} ${at}`;
}

async function fetchLatestRows(client, limit) {
  const result = await client.query(
    `
    WITH combined AS (
      SELECT
        'doj'::text AS source,
        query_text,
        hit_count,
        last_success_at::text AS last_success_at
      FROM doj_search_queries
      UNION ALL
      SELECT
        'advanced'::text AS source,
        query_text,
        hit_count,
        last_success_at::text AS last_success_at
      FROM search_v2_queries
    )
    SELECT source, query_text, hit_count, last_success_at
    FROM combined
    ORDER BY last_success_at DESC
    LIMIT $1
    `,
    [limit],
  );
  return result.rows;
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

  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("Missing DB connection string in environment.");
  }

  const client = new Client({
    connectionString,
    ssl: parseSsl(connectionString),
  });
  await client.connect();

  console.log(
    `[query-watch ${now()}] tailing via DB poll intervalMs=${Math.floor(args.intervalMs)} limit=${Math.floor(args.limit)} replayLatest=${args.replayLatest}`,
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

  try {
    const seen = new Map();

    const bootstrapRows = await fetchLatestRows(client, Math.floor(args.limit));
    for (const row of bootstrapRows) {
      const key = `${row.source}::${row.query_text}`;
      const lastMs = safeDateMs(row.last_success_at);
      const hitCount = Number(row.hit_count) || 0;
      seen.set(key, { lastMs, hitCount });
      if (args.replayLatest) {
        console.log(
          formatQueryWatchRow({
            source: row.source,
            queryText: row.query_text,
            hitCount,
            lastSuccessAt: row.last_success_at,
          }),
        );
      }
    }

    while (keepRunning) {
      try {
        const rows = await fetchLatestRows(client, Math.floor(args.limit));
        for (const row of rows.reverse()) {
          const key = `${row.source}::${row.query_text}`;
          const currentMs = safeDateMs(row.last_success_at);
          const currentHits = Number(row.hit_count) || 0;
          const previous = seen.get(key);
          const isNew =
            !previous ||
            currentMs > previous.lastMs ||
            (currentMs === previous.lastMs && currentHits > previous.hitCount);
          if (!isNew) {
            continue;
          }
          const delta = previous ? Math.max(0, currentHits - previous.hitCount) : undefined;
          seen.set(key, { lastMs: currentMs, hitCount: currentHits });
          console.log(
            formatQueryWatchRow({
              source: row.source,
              queryText: row.query_text,
              hitCount: currentHits,
              lastSuccessAt: row.last_success_at,
              delta,
            }),
          );
        }
      } catch (error) {
        console.error(`[query-watch ${now()}] poll error: ${String(error)}`);
      }

      await sleep(Math.floor(args.intervalMs));
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
