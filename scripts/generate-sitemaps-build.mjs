#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const DEFAULT_BATCH_SIZE = 45000;

function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[sitemap:build ${timestamp}] ${message}`);
}

function parseArgs(argv) {
  const args = {
    wranglerConfigPath: "wrangler.jsonc",
    siteUrl: "",
    batchSize: Number(process.env.SITEMAP_BATCH_SIZE || DEFAULT_BATCH_SIZE),
    force: false,
    flagName: process.env.SITEMAP_BUILD_FLAG || "SITEMAP_REBUILD"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--wrangler-config" && next) {
      args.wranglerConfigPath = next;
      i += 1;
      continue;
    }
    if (arg === "--site-url" && next) {
      args.siteUrl = next;
      i += 1;
      continue;
    }
    if (arg === "--batch-size" && next) {
      args.batchSize = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--flag-name" && next) {
      args.flagName = next;
      i += 1;
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
  console.log(`Generate static sitemap XML files at build time.

Usage:
  node scripts/generate-sitemaps-build.mjs [options]

Options:
  --wrangler-config <path>  Path to wrangler.jsonc (default: ./wrangler.jsonc)
  --site-url <url>          Canonical site URL (defaults from wrangler vars.SITE_URL)
  --batch-size <n>          File detail URLs per sitemap file (default: 45000)
  --force                   Regenerate regardless of env flag
  --flag-name <name>        Env flag required when not forced (default: SITEMAP_REBUILD)
  --help, -h                Show help
`);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toIsoDate(value) {
  return new Date(value).toISOString();
}

function readFirstMatch(content, regex, label) {
  const match = content.match(regex);
  if (!match?.[1]) {
    throw new Error(`Could not resolve ${label} from wrangler config.`);
  }
  return match[1].trim();
}

async function readWranglerSiteUrl(configPath) {
  const raw = await fs.readFile(configPath, "utf8");
  return readFirstMatch(
    raw,
    /"vars"\s*:\s*{[\s\S]*?"SITE_URL"\s*:\s*"([^"]+)"/m,
    "vars.SITE_URL"
  );
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
    // Default to permissive SSL for managed providers.
  }
  return { rejectUnauthorized: false };
}

function createPool() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing POSTGRES_URL (or DATABASE_URL) environment variable.");
  }

  return new Pool({
    connectionString,
    ssl: parseSsl(connectionString),
    max: 4
  });
}

function buildUrlsetXml(urlEntries) {
  const body = urlEntries
    .map(
      (entry) => `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>\n    <changefreq>${xmlEscape(entry.changefreq)}</changefreq>\n    <priority>${xmlEscape(String(entry.priority))}</priority>\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function buildSitemapIndexXml(entries) {
  const body = entries
    .map(
      (entry) => `  <sitemap>\n    <loc>${xmlEscape(entry.loc)}</loc>\n    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>\n  </sitemap>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const shouldBuild = args.force || /^(1|true|yes)$/i.test(process.env[args.flagName] || "");
  if (!shouldBuild) {
    logInfo(
      `Skipping sitemap generation. Set ${args.flagName}=1 or pass --force to regenerate.`
    );
    return;
  }

  if (!Number.isInteger(args.batchSize) || args.batchSize <= 0) {
    throw new Error("--batch-size must be a positive integer.");
  }

  const wranglerConfigPath = path.resolve(process.cwd(), args.wranglerConfigPath);
  const siteUrl = (args.siteUrl || (await readWranglerSiteUrl(wranglerConfigPath))).replace(/\/+$/, "");
  const now = toIsoDate(Date.now());

  const publicDir = path.resolve(process.cwd(), "public");
  const sitemapsDir = path.join(publicDir, "sitemaps");

  await fs.mkdir(publicDir, { recursive: true });
  await fs.rm(sitemapsDir, { recursive: true, force: true });
  await fs.mkdir(sitemapsDir, { recursive: true });

  const pool = createPool();

  logInfo(`Generating sitemaps with Postgres, siteUrl=${siteUrl}, batchSize=${args.batchSize}`);

  const indexEntries = [];

  const dashboardXml = buildUrlsetXml([
    {
      loc: `${siteUrl}/`,
      lastmod: now,
      changefreq: "daily",
      priority: 1
    }
  ]);
  const dashboardPath = path.join(sitemapsDir, "dashboard.xml");
  await fs.writeFile(dashboardPath, dashboardXml, "utf8");
  indexEntries.push({ loc: `${siteUrl}/sitemaps/dashboard.xml`, lastmod: now });

  let sitemapNumber = 0;
  let totalRows = 0;
  let lastEftaId = "";

  while (true) {
    const rowsResult = await pool.query(
      `
      SELECT efta_id
      FROM files
      WHERE ($1 = '' OR efta_id > $1)
      ORDER BY efta_id ASC
      LIMIT $2
      `,
      [lastEftaId, args.batchSize]
    );

    const rows = rowsResult.rows;

    if (!rows.length) {
      break;
    }

    sitemapNumber += 1;
    totalRows += rows.length;
    lastEftaId = String(rows[rows.length - 1].efta_id || "");

    const fileName = `files-${String(sitemapNumber).padStart(5, "0")}.xml`;
    const filePath = path.join(sitemapsDir, fileName);
    const urls = rows.map((row) => ({
      loc: `${siteUrl}/file/${encodeURIComponent(String(row.efta_id))}`,
      lastmod: now,
      changefreq: "daily",
      priority: 0.6
    }));

    await fs.writeFile(filePath, buildUrlsetXml(urls), "utf8");
    indexEntries.push({ loc: `${siteUrl}/sitemaps/${fileName}`, lastmod: now });

    logInfo(`Wrote sitemap ${fileName} with ${rows.length} URLs (last efta_id=${lastEftaId})`);
  }

  await pool.end();

  const sitemapIndexPath = path.join(publicDir, "sitemap.xml");
  await fs.writeFile(sitemapIndexPath, buildSitemapIndexXml(indexEntries), "utf8");

  logInfo(
    `Sitemap generation complete. URL files=${indexEntries.length}, file URLs=${totalRows}, output=${sitemapIndexPath}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
