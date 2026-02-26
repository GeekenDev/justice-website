#!/usr/bin/env node
import readline from "node:readline";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

const USE_COLOR =
  process.env.NO_COLOR !== "1" && process.env.NO_COLOR !== "true";

function colorize(value, color) {
  if (!USE_COLOR) return value;
  return `${color}${value}${ANSI.reset}`;
}

function now() {
  return new Date().toISOString();
}

function normalizeInputLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  function findUrlInObject(value) {
    if (!value || typeof value !== "object") {
      return "";
    }
    if (typeof value.url === "string" && /^https?:\/\//i.test(value.url)) {
      return value.url;
    }
    for (const nested of Object.values(value)) {
      if (!nested || typeof nested !== "object") {
        continue;
      }
      const candidate = findUrlInObject(nested);
      if (candidate) {
        return candidate;
      }
    }
    return "";
  }

  // Common case from `jq .event.request.url`: quoted JSON string
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  // Fallback: raw URL or JSON object
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const discoveredUrl = findUrlInObject(parsed);
      if (discoveredUrl) return discoveredUrl;
    } catch {
      // ignore
    }
  }

  const inlineUrlMatch = trimmed.match(/https?:\/\/[^\s"]+/i);
  if (inlineUrlMatch) {
    return inlineUrlMatch[0];
  }

  return trimmed;
}

function parseWranglerRequestLine(line) {
  // Example:
  // GET https://justice.geeken.dev/api/doj-search?keys=jerky&page=18 - Ok @ 2/26/2026, 1:25:02 PM
  const match = line.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/\S+)\s+-\s+(.+)$/i,
  );
  if (!match) return null;
  const tailMeta = match[3].trim();
  const metaMatch = tailMeta.match(/^([A-Za-z][A-Za-z\s]+?)(?:\s+@\s+(.+))?$/);
  const status = (metaMatch?.[1] ?? tailMeta).trim();
  const at = (metaMatch?.[2] ?? "").trim();
  return {
    method: match[1].toUpperCase(),
    url: match[2],
    tailMeta,
    status,
    at,
  };
}

function normalizePageUrl(url) {
  const params = new URLSearchParams(url.search);
  params.delete("_rsc");
  const cleanSearch = params.toString();
  return `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ""}`;
}

function isStaticAsset(pathname) {
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/sitemaps/") ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.json" ||
    pathname === "/apple-icon.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon0.svg" ||
    pathname === "/icon1.png"
  ) {
    return true;
  }
  return /\.(css|js|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|pdf|xml)$/i.test(
    pathname,
  );
}

function formatSearchEvent(url) {
  const pathname = url.pathname;
  const params = url.searchParams;

  if (pathname === "/api/doj-search") {
    const keys = params.get("keys") ?? "";
    const page = params.get("page") ?? "1";
    if (!keys) {
      return null;
    }
    return `DOJSEARCH: "${keys}" page=${page}`;
  }

  if (pathname === "/api/doj-search/suggestions") {
    const q = params.get("q") ?? "";
    const limit = params.get("limit") ?? "";
    if (!q) {
      return null;
    }
    return `DOJ_SUGGEST q="${q}"${limit ? ` limit=${limit}` : ""}`;
  }

  if (pathname === "/api/search") {
    const q = params.get("q") ?? "";
    if (q) {
      return `CORE_SEARCH: "${q}"`;
    }
    return "ADVANCED SEARCH";
  }

  return null;
}

function colorForStatus(status) {
  const s = status.toLowerCase();
  if (s.includes("ok")) return ANSI.green;
  if (s.includes("cancel")) return ANSI.yellow;
  if (s.includes("error") || s.includes("fail") || s.includes("exception")) {
    return ANSI.red;
  }
  return ANSI.gray;
}

function formatMeta(wranglerReq) {
  const statusText = wranglerReq.status || wranglerReq.tailMeta || "";
  const atText = wranglerReq.at ? ` @ ${wranglerReq.at}` : "";
  const statusPart = statusText
    ? colorize(statusText, colorForStatus(statusText))
    : "";
  return `${colorize(`(${wranglerReq.method})`, ANSI.gray)}${statusPart ? ` ${statusPart}` : ""}${atText ? colorize(atText, ANSI.dim) : ""}`;
}

console.log(
  `${colorize(`[tail-parse ${now()}]`, ANSI.dim)} ready. Pipe URL lines (e.g. wrangler tail | jq .event.request.url)`,
);

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const wranglerReq = parseWranglerRequestLine(line.trim());
  if (wranglerReq) {
    const parsedUrl = normalizeInputLine(wranglerReq.url);
    if (!parsedUrl) return;

    let url;
    try {
      url = new URL(parsedUrl);
    } catch {
      return;
    }

    const searchEvent = formatSearchEvent(url);
    if (searchEvent) {
      let color = ANSI.cyan;
      if (searchEvent.startsWith("DOJSEARCH:")) color = ANSI.magenta;
      else if (searchEvent.startsWith("DOJ_SUGGEST")) color = ANSI.yellow;
      else if (searchEvent.startsWith("ADVANCED SEARCH")) color = ANSI.red;
      else if (searchEvent.startsWith("CORE_SEARCH")) color = ANSI.cyan;
      console.log(
        `${colorize(`[${now()}]`, ANSI.dim)} ${colorize(searchEvent, color)} ${formatMeta(wranglerReq)}`,
      );
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      return;
    }
    if (isStaticAsset(url.pathname)) {
      return;
    }

    console.log(
      `${colorize(`[${now()}]`, ANSI.dim)} ${colorize("PAGE", ANSI.blue)} ${normalizePageUrl(url)} ${formatMeta(wranglerReq)}`,
    );
    return;
  }

  const wranglerLog = line.trim().match(/^\(log\)\s+(.*)$/);
  if (wranglerLog) {
    const payload = wranglerLog[1];
    const queryMatch = payload.match(/query="([^"]+)"/);
    const pageMatch = payload.match(/page=(\d+)/);
    if (
      (payload.includes("[doj-search]") || payload.includes("[search-v2]")) &&
      queryMatch
    ) {
      const pageSuffix = pageMatch ? ` page=${pageMatch[1]}` : "";
      const event = `DOJSEARCH: "${queryMatch[1]}"${pageSuffix}`;
      console.log(
        `${colorize(`[${now()}]`, ANSI.dim)} ${colorize(event, ANSI.magenta)}`,
      );
      return;
    }
    const tagged = payload.includes("[doj-search]") || payload.includes("[search-v2]")
      ? colorize(payload, ANSI.magenta)
      : colorize(payload, ANSI.gray);
    console.log(`${colorize(`[${now()}]`, ANSI.dim)} ${tagged}`);
    return;
  }

  const raw = normalizeInputLine(line);
  if (!raw) {
    return;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return;
  }

  const searchEvent = formatSearchEvent(url);
  if (searchEvent) {
    let color = ANSI.cyan;
    if (searchEvent.startsWith("DOJSEARCH:")) color = ANSI.magenta;
    else if (searchEvent.startsWith("DOJ_SUGGEST")) color = ANSI.yellow;
    else if (searchEvent.startsWith("ADVANCED SEARCH")) color = ANSI.red;
    else if (searchEvent.startsWith("CORE_SEARCH")) color = ANSI.green;
    console.log(`${colorize(`[${now()}]`, ANSI.dim)} ${colorize(searchEvent, color)}`);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (isStaticAsset(url.pathname)) {
    return;
  }

  console.log(
    `${colorize(`[${now()}]`, ANSI.dim)} ${colorize("PAGE", ANSI.blue)} ${normalizePageUrl(url)}`,
  );
});
