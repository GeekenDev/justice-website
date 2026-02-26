#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_DELETE_CONCURRENCY = 20;

function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[kv:flush ${timestamp}] ${message}`);
}

function parseArgs(argv) {
  const args = {
    binding: process.env.CLOUDFLARE_KV_BINDING || "QUERY_CACHE",
    namespaceId: process.env.CLOUDFLARE_QUERY_CACHE_KV_NAMESPACE_ID || "",
    prefix: process.env.CLOUDFLARE_KV_PREFIX || "",
    dryRun: false,
    pageSize: Number(process.env.CLOUDFLARE_KV_PAGE_SIZE || DEFAULT_PAGE_SIZE),
    concurrency: Number(
      process.env.CLOUDFLARE_KV_DELETE_CONCURRENCY || DEFAULT_DELETE_CONCURRENCY,
    ),
    wranglerConfigPath: process.env.CLOUDFLARE_WRANGLER_CONFIG_PATH || "",
    wranglerBin: process.env.WRANGLER_BIN || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--binding" && next) {
      args.binding = next;
      i += 1;
      continue;
    }
    if (arg === "--namespace-id" && next) {
      args.namespaceId = next;
      i += 1;
      continue;
    }
    if (arg === "--prefix" && next) {
      args.prefix = next;
      i += 1;
      continue;
    }
    if (arg === "--page-size" && next) {
      args.pageSize = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--concurrency" && next) {
      args.concurrency = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--wrangler-config" && next) {
      args.wranglerConfigPath = next;
      i += 1;
      continue;
    }
    if (arg === "--wrangler-bin" && next) {
      args.wranglerBin = next;
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
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
  console.log(`Flush all keys from a Cloudflare KV namespace (query cache).

Usage:
  node scripts/flush-query-cache-kv.mjs [options]

Options:
  --binding <name>         KV binding name in wrangler config (default: QUERY_CACHE)
  --namespace-id <id>      KV namespace id (overrides binding lookup)
  --prefix <prefix>        Delete only keys with this prefix
  --page-size <n>          Keys fetched per list request (default: 1000)
  --concurrency <n>        Concurrent delete requests (default: 20)
  --wrangler-config <path> Path to wrangler.jsonc (default: ./wrangler.jsonc)
  --wrangler-bin <path>    Path/command for wrangler binary
  --dry-run                List keys only; do not delete
  --help, -h               Show help

Optional env:
  CLOUDFLARE_QUERY_CACHE_KV_NAMESPACE_ID
  CLOUDFLARE_KV_BINDING
  CLOUDFLARE_KV_PREFIX
  CLOUDFLARE_WRANGLER_CONFIG_PATH
  WRANGLER_BIN
`);
}

function buildWranglerCandidates(preferred) {
  const candidates = [];
  if (preferred) {
    candidates.push(preferred);
  }
  candidates.push(
    path.resolve(
      process.cwd(),
      "node_modules",
      ".bin",
      process.platform === "win32" ? "wrangler.cmd" : "wrangler",
    ),
  );
  candidates.push("wrangler");
  if (process.platform === "win32") {
    candidates.push("wrangler.cmd");
  }
  return [...new Set(candidates)];
}

async function runWranglerCapture(args, preferredBin) {
  const candidates = buildWranglerCandidates(preferredBin);
  let lastErr = null;

  for (const cmd of candidates) {
    try {
      const output = await new Promise((resolve, reject) => {
        const isWindowsCmd =
          process.platform === "win32" &&
          (cmd.toLowerCase().endsWith(".cmd") ||
            cmd.toLowerCase().endsWith(".bat"));
        const child = isWindowsCmd
          ? spawn("cmd.exe", ["/d", "/s", "/c", cmd, ...args], {
              stdio: ["ignore", "pipe", "pipe"],
              shell: false,
            })
          : spawn(cmd, args, {
              stdio: ["ignore", "pipe", "pipe"],
              shell: false,
            });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0) {
            resolve({ stdout, stderr, cmd });
          } else {
            reject(new Error(`wrangler exited with code ${code}: ${stderr || stdout}`));
          }
        });
      });
      return output;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        lastErr = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Could not find a wrangler executable. Tried: ${candidates.join(", ")}${
      lastErr ? ` (${lastErr.code})` : ""
    }`,
  );
}

function parseJsonFromOutput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const idxArray = trimmed.lastIndexOf("\n[");
    const idxObj = trimmed.lastIndexOf("\n{");
    const idx = Math.max(idxArray, idxObj);
    if (idx === -1) {
      throw new Error(`Unable to parse JSON output: ${trimmed.slice(0, 400)}`);
    }
    return JSON.parse(trimmed.slice(idx + 1));
  }
}

async function readNamespaceIdFromWrangler(binding, customConfigPath) {
  const configPath = customConfigPath
    ? path.resolve(process.cwd(), customConfigPath)
    : path.resolve(process.cwd(), "wrangler.jsonc");
  const raw = await fs.readFile(configPath, "utf8");

  const re = new RegExp(
    String.raw`"binding"\s*:\s*"${binding}"[\s\S]*?"id"\s*:\s*"([^"]+)"`,
    "m",
  );
  const match = raw.match(re);
  if (!match?.[1]) {
    throw new Error(
      `Could not find namespace id for binding "${binding}" in ${configPath}`,
    );
  }
  return match[1];
}

async function listKeysViaWrangler(namespaceId, prefix, wranglerBin) {
  const args = [
    "kv",
    "key",
    "list",
    "--namespace-id",
    namespaceId,
    "--remote",
  ];
  if (prefix) {
    args.push("--prefix", prefix);
  }

  const { stdout, cmd } = await runWranglerCapture(args, wranglerBin);
  logInfo(`Listed keys via wrangler: ${cmd}`);
  const payload = parseJsonFromOutput(stdout);

  if (Array.isArray(payload)) {
    return {
      keys: payload.map((row) => String(row?.name ?? "")).filter(Boolean),
      nextCursor: "",
    };
  }

  const results = Array.isArray(payload?.result)
    ? payload.result
    : Array.isArray(payload?.keys)
      ? payload.keys
      : [];
  const keys = results.map((row) => String(row?.name ?? "")).filter(Boolean);
  return { keys, nextCursor: "" };
}

async function runWithConcurrency(items, concurrency, task) {
  if (items.length === 0) {
    return;
  }
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const current = items[index];
        index += 1;
        await task(current);
      }
    },
  );
  await Promise.all(workers);
}

async function deleteKeysPageViaWrangler(namespaceId, keys, concurrency, wranglerBin) {
  await runWithConcurrency(keys, concurrency, async (key) => {
    const args = [
      "kv",
      "key",
      "delete",
      "--namespace-id",
      namespaceId,
      key,
      "--remote",
    ];
    await runWranglerCapture(args, wranglerBin);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!Number.isInteger(args.pageSize) || args.pageSize <= 0 || args.pageSize > 1000) {
    throw new Error("--page-size must be an integer from 1 to 1000.");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer.");
  }

  const namespaceId =
    args.namespaceId || (await readNamespaceIdFromWrangler(args.binding, args.wranglerConfigPath));

  logInfo(
    `Starting KV flush: namespace=${namespaceId}, binding=${args.binding}, prefix=${args.prefix || "<all>"}, dryRun=${args.dryRun}, pageSize=${args.pageSize}, concurrency=${args.concurrency}, mode=wrangler-auth`,
  );

  let cursor = "";
  let page = 0;
  let totalListed = 0;
  let totalDeleted = 0;

  while (true) {
    page += 1;
    const { keys, nextCursor } = await listKeysViaWrangler(
      namespaceId,
      args.prefix,
      args.wranglerBin,
    );
    totalListed += keys.length;

    if (keys.length === 0) {
      logInfo(`Page ${page}: no keys`);
    } else {
      logInfo(`Page ${page}: listed ${keys.length} keys`);
      if (!args.dryRun) {
        await deleteKeysPageViaWrangler(
          namespaceId,
          keys,
          args.concurrency,
          args.wranglerBin,
        );
        totalDeleted += keys.length;
        logInfo(`Page ${page}: deleted ${keys.length} keys`);
      }
    }

    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  logInfo(
    args.dryRun
      ? `Dry run complete. Keys matched: ${totalListed}`
      : `Flush complete. Keys listed: ${totalListed}, keys deleted: ${totalDeleted}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
