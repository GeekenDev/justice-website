"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MobileChunkedPdfModal from "@/components/mobile-chunked-pdf-modal";
import GlobalNav from "@/components/global-nav";
import { globalNavConfig } from "@/lib/global-nav-config";
import type { FilesChangeLogFeedItem } from "@/lib/db";

const PAGE_SIZE = 20;

type LogPageClientProps = {
  initialItems: FilesChangeLogFeedItem[];
  initialHasMore: boolean;
  initialError: string | null;
};

type LogApiPayload = {
  items?: FilesChangeLogFeedItem[];
  hasMore?: boolean;
  nextOffset?: number;
  error?: string;
  details?: string;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(parsed);
  const monthRaw = new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(parsed);
  const month = monthRaw.endsWith(".") ? monthRaw : `${monthRaw}.`;
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
  }).format(parsed);
  return `${weekday}, ${month} ${day}`;
}

function trimDescription(value: string | null) {
  const compact = value?.trim() || "";
  if (!compact) {
    return "No description available.";
  }
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function hashStatusLabel(value: boolean | null, existsInFiles: boolean) {
  if (!existsInFiles) {
    return "File not found in files table";
  }
  if (value === true) {
    return "Hash unchanged";
  }
  if (value === false) {
    return "Hash changed";
  }
  return "Hash status unavailable";
}

function changeKindLabel(kind: "deleted" | "restored") {
  if (kind === "deleted") {
    return "Deleted";
  }
  return "Restored";
}

function getItemKey(item: FilesChangeLogFeedItem, index: number) {
  return `${item.efta_id}|${item.changed_at ?? ""}|${item.change_kind}|${index}`;
}

export default function LogPageClient({
  initialItems,
  initialHasMore,
  initialError,
}: LogPageClientProps) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewEftaId, setPreviewEftaId] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);

  const fetchMore = useCallback(async () => {
    if (isFetchingRef.current || loadingMore || !hasMore) {
      return;
    }
    isFetchingRef.current = true;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const offset = items.length;
      const response = await fetch(`/api/log?offset=${offset}&limit=${PAGE_SIZE}`);
      const payload = (await response.json()) as LogApiPayload;
      if (!response.ok) {
        throw new Error(payload.details || payload.error || "Unable to load more entries.");
      }
      const nextItems = payload.items ?? [];
      setItems((prev) => {
        const next = [...prev];
        const seen = new Set(prev.map((item, index) => getItemKey(item, index)));
        nextItems.forEach((item, index) => {
          const key = getItemKey(item, offset + index);
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          next.push(item);
        });
        return next;
      });
      setHasMore(Boolean(payload.hasMore));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load more entries.");
    } finally {
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [hasMore, items.length, loadingMore]);

  useEffect(() => {
    if (isFetchingRef.current || loadingMore || !hasMore) {
      return;
    }
    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        if (isFetchingRef.current || loadingMore || !hasMore) {
          return;
        }
        void fetchMore();
      },
      {
        root: null,
        rootMargin: "500px 0px",
        threshold: 0,
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchMore, hasMore, loadingMore, items.length]);

  function onOpenPdfPreview(eftaId: string) {
    const normalized = eftaId.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    setPreviewEftaId(normalized);
    setPreviewTitle(`Document Viewer - ${normalized}`);
    setPreviewUrl(`/api/pdf/${encodeURIComponent(normalized)}`);
  }

  return (
    <main className="app-shell log-page">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="hero">
        <p className="eyebrow">Activity Feed</p>
        <h1>Change Log</h1>
        <p className="subtitle">
          Tracked changes detected in the DOJ Public Dataset
        </p>
      </section>

      <GlobalNav
        items={globalNavConfig.items}
        mobileTitle={globalNavConfig.mobileTitle}
        initiallyExpandedGroups={globalNavConfig.initiallyExpandedGroups}
      />

      <section className="panel detail-nav link-bar">
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
        <span className="log-summary">{items.length.toLocaleString("en-US")} entries loaded</span>
      </section>

      <section className="panel log-feed-panel log-feed-panel-compact">
        {loadError ? (
          <p className="empty">
            Could not load log entries: {loadError}
          </p>
        ) : null}
        {items.length === 0 && !loadError ? (
          <p className="empty">
            No rows were found in <span className="mono">public.files_change_log</span>.
          </p>
        ) : (
          <ol className="log-feed-list log-feed-list-compact">
            {items.map((item, index) => {
              const changedAtLabel = formatDateTime(item.changed_at);
              const changeKind = changeKindLabel(item.change_kind);
              const hashLabel = hashStatusLabel(
                item.hash_matches_original,
                item.exists_in_files,
              );
              const description = trimDescription(item.description);

              return (
                <li
                  key={getItemKey(item, index)}
                  className="log-entry-card compact log-entry-card-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenPdfPreview(item.efta_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenPdfPreview(item.efta_id);
                    }
                  }}
                >
                  <div className="log-entry-main">
                    <div className="log-entry-title-row">
                      <span className="table-link mono log-efta-link">
                        {item.efta_id}
                      </span>
                      <span
                        className={`badge ${
                          item.change_kind === "deleted" ? "badge-danger" : "badge-ok"
                        }`}
                      >
                        {changeKind}
                      </span>
                      <span
                        className={`badge ${
                          item.hash_matches_original === true
                            ? "badge-ok"
                            : item.hash_matches_original === false
                              ? "badge-danger"
                              : "badge-muted"
                        }`}
                      >
                        {hashLabel}
                      </span>
                    </div>
                    <p className="log-entry-description">{description}</p>
                    <div className="log-entry-meta-line">
                      <span>{changedAtLabel ?? "Time unavailable"}</span>
                      <span className="log-dot">•</span>
                      <span className="table-link">Open document</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {items.length > 0 && hasMore ? (
          <div ref={loadMoreRef} className="results-infinite-trigger" aria-hidden="true" />
        ) : null}
        {loadingMore ? (
          <p className="results-infinite-status">Loading more log entries...</p>
        ) : null}
        {!loadingMore && !hasMore && items.length > 0 ? (
          <p className="results-infinite-status">End of log.</p>
        ) : null}
      </section>

      {previewUrl ? (
        <MobileChunkedPdfModal
          sourceUrl={previewUrl}
          title={previewTitle}
          kicker="Document Viewer"
          eftaId={previewEftaId}
          voteUrl={previewUrl}
          voteTitle={previewEftaId}
          voteFileName={`${previewEftaId}.pdf`}
          onClose={() => {
            setPreviewUrl(null);
            setPreviewTitle("");
            setPreviewEftaId("");
          }}
        />
      ) : null}
    </main>
  );
}
