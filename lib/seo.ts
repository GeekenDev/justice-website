import { getCloudflareContext } from "@opennextjs/cloudflare";

export const primarySitelinkPages = [
  { name: "Search", path: "/search" },
  { name: "Deleted Docs Browser", path: "/deleted-docs-browser" },
  { name: "Archive Downloads", path: "/archive-downloads" },
  { name: "Top Searches", path: "/doj-top-upvoted" },
] as const;

export function getSiteUrl() {
  let workerUrl = "";
  try {
    const context = getCloudflareContext();
    const env = context?.env as unknown as
      | { SITE_URL?: string; NEXT_PUBLIC_SITE_URL?: string }
      | undefined;
    workerUrl = env?.SITE_URL?.trim() || env?.NEXT_PUBLIC_SITE_URL?.trim() || "";
  } catch {
    workerUrl = "";
  }

  const raw = workerUrl || process.env.SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(pathname: string) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getSiteUrl()}${path}`;
}
