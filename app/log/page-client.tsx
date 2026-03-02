"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type DailySummaryApiPayload = {
  days?: Array<{
    day_key: string;
    total: number;
    deleted: number;
    restored: number;
    hash_changed: number;
  }>;
  error?: string;
  details?: string;
};

function getUserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(parsed);
  const monthRaw = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone,
  }).format(parsed);
  const month = monthRaw.endsWith(".") ? monthRaw : `${monthRaw}.`;
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone,
  }).format(parsed);
  return `${weekday}, ${month} ${day}`;
}

function getYmdPartsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  if (!year || !month || !day) {
    return null;
  }
  return { year, month, day };
}

function getDayKeyFromDate(value: Date, timeZone: string) {
  const parts = getYmdPartsInTimeZone(value, timeZone);
  if (!parts) {
    return null;
  }
  const { year, month, day } = parts;
  return `${year}-${month}-${day}`;
}

function getDayKey(value: string | null, timeZone: string) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return getDayKeyFromDate(parsed, timeZone);
}

function formatDayLabel(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    return "Unknown date";
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  const parsed = new Date(
    Date.UTC(year, monthNumber - 1, dayOfMonth, 12, 0, 0),
  );
  if (Number.isNaN(parsed.valueOf())) {
    return dayKey;
  }
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parsed);
  const monthRaw = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(parsed);
  const month = monthRaw.endsWith(".") ? monthRaw : `${monthRaw}.`;
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
  return `${weekday}, ${month} ${day}`;
}

function createLastNDaysBase(days: number, timeZone: string) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Array.from({ length: days }, (_, offset) => {
    const dayDate = new Date(now);
    dayDate.setDate(now.getDate() - (days - 1 - offset));
    const dayKey = getDayKeyFromDate(dayDate, timeZone);
    return {
      dayKey: dayKey ?? "__unknown__",
      label: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone,
      }).format(dayDate),
      title: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone,
      }).format(dayDate),
      total: 0,
      deleted: 0,
      restored: 0,
      hashChanged: 0,
    };
  });
}

function trimDescription(value: string | null) {
  const compact = value?.trim() || "";
  if (!compact) {
    return "No description available.";
  }
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function formatDatasetLabel(value: string | null | undefined) {
  const normalized = value?.trim() || "";
  if (!normalized) {
    return null;
  }
  if (/^dataset\s+/i.test(normalized)) {
    return normalized;
  }
  return `Dataset ${normalized}`;
}

function hashStatusLabel(value: boolean | null, existsInFiles: boolean) {
  if (!existsInFiles) {
    return "File not found in files table";
  }
  if (value === true) {
    return "Hash unchanged";
  }
  if (value === false) {
    return "Change Detected";
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
  const [userTimeZone, setUserTimeZone] = useState("UTC");
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewEftaId, setPreviewEftaId] = useState("");
  const [weeklySeries, setWeeklySeries] = useState(() =>
    createLastNDaysBase(7, "UTC"),
  );
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [dailySummaryByDayKey, setDailySummaryByDayKey] = useState<
    Record<
      string,
      { total: number; deleted: number; restored: number; hashChanged: number }
    >
  >({});
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const lastDailySummaryQueryRef = useRef<string | null>(null);
  useEffect(() => {
    setUserTimeZone(getUserTimeZone());
  }, []);

  const groupedItems = useMemo(
    () =>
      items.reduce<
        Array<{
          dayKey: string;
          dayLabel: string;
          items: Array<{ item: FilesChangeLogFeedItem; index: number }>;
          deletedCount: number;
          restoredCount: number;
          hashChangedCount: number;
        }>
      >((acc, item, index) => {
        const dayKey =
          getDayKey(item.changed_at, userTimeZone) ?? "__unknown__";
        const dayLabel =
          dayKey === "__unknown__"
            ? "Unknown date"
            : formatDayLabel(dayKey);
        const lastGroup = acc[acc.length - 1];
        if (!lastGroup || lastGroup.dayKey !== dayKey) {
          acc.push({
            dayKey,
            dayLabel,
            items: [{ item, index }],
            deletedCount: item.change_kind === "deleted" ? 1 : 0,
            restoredCount: item.change_kind === "restored" ? 1 : 0,
            hashChangedCount: item.hash_matches_original === false ? 1 : 0,
          });
          return acc;
        }
        lastGroup.items.push({ item, index });
        if (item.change_kind === "deleted") {
          lastGroup.deletedCount += 1;
        }
        if (item.change_kind === "restored") {
          lastGroup.restoredCount += 1;
        }
        if (item.hash_matches_original === false) {
          lastGroup.hashChangedCount += 1;
        }
        return acc;
      }, []),
    [items, userTimeZone],
  );
  const weeklyMax = weeklySeries.reduce(
    (max, day) => Math.max(max, day.total),
    0,
  );
  const weeklyTotal = weeklySeries.reduce((sum, day) => sum + day.total, 0);
  const weeklyDeletedTotal = weeklySeries.reduce(
    (sum, day) => sum + day.deleted,
    0,
  );
  const weeklyRestoredTotal = weeklySeries.reduce(
    (sum, day) => sum + day.restored,
    0,
  );
  const weeklyHashChangedTotal = weeklySeries.reduce(
    (sum, day) => sum + day.hashChanged,
    0,
  );
  const peakDay = weeklySeries.reduce<(typeof weeklySeries)[number] | null>(
    (current, day) => {
      if (!current || day.total > current.total) {
        return day;
      }
      return current;
    },
    null,
  );
  const visibleDayKeys = useMemo(
    () =>
      Array.from(
        new Set(
          groupedItems
            .map((group) => group.dayKey)
            .filter((dayKey) => dayKey !== "__unknown__"),
        ),
      ),
    [groupedItems],
  );
  const visibleDayKeysQuery = useMemo(
    () =>
      visibleDayKeys
        .map((dayKey) => `day=${encodeURIComponent(dayKey)}`)
        .join("&"),
    [visibleDayKeys],
  );
  const visibleDayKeysRequestKey = useMemo(
    () => `${userTimeZone}|${visibleDayKeysQuery}`,
    [userTimeZone, visibleDayKeysQuery],
  );

  const fetchMore = useCallback(async () => {
    if (isFetchingRef.current || loadingMore || !hasMore) {
      return;
    }
    isFetchingRef.current = true;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const offset = items.length;
      const response = await fetch(
        `/api/log?offset=${offset}&limit=${PAGE_SIZE}`,
      );
      const payload = (await response.json()) as LogApiPayload;
      if (!response.ok) {
        throw new Error(
          payload.details || payload.error || "Unable to load more entries.",
        );
      }
      const nextItems = payload.items ?? [];
      setItems((prev) => {
        const next = [...prev];
        const seen = new Set(
          prev.map((item, index) => getItemKey(item, index)),
        );
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
      setLoadError(
        error instanceof Error ? error.message : "Unable to load more entries.",
      );
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

  useEffect(() => {
    let canceled = false;
    const abortController = new AbortController();

    async function loadWeeklySummary() {
      try {
        setWeeklyError(null);
        const baseDays = createLastNDaysBase(7, userTimeZone).filter(
          (day) => day.dayKey !== "__unknown__",
        );
        const params = new URLSearchParams();
        baseDays.forEach((day) => params.append("day", day.dayKey));
        params.set("tz", userTimeZone);
        const response = await fetch(
          `/api/log/daily-summary?${params.toString()}`,
          {
            signal: abortController.signal,
          },
        );
        const payload = (await response.json()) as DailySummaryApiPayload;
        if (!response.ok) {
          throw new Error(
            payload.details ||
              payload.error ||
              "Unable to load weekly summary.",
          );
        }

        const byKey = new Map(
          (payload.days ?? []).map((day) => [
            day.day_key,
            {
              total: day.total,
              deleted: day.deleted,
              restored: day.restored,
              hashChanged: day.hash_changed,
            },
          ]),
        );
        const merged = baseDays.map((day) => ({
          ...day,
          ...(byKey.get(day.dayKey) ?? {}),
        }));
        if (!canceled) {
          setWeeklySeries(merged);
        }
      } catch (error) {
        if (abortController.signal.aborted || canceled) {
          return;
        }
        setWeeklyError(
          error instanceof Error
            ? error.message
            : "Unable to load weekly summary.",
        );
        setWeeklySeries(createLastNDaysBase(7, userTimeZone));
      }
    }

    void loadWeeklySummary();
    return () => {
      canceled = true;
      abortController.abort();
    };
  }, [userTimeZone]);

  useEffect(() => {
    if (!visibleDayKeysQuery) {
      setDailySummaryByDayKey({});
      lastDailySummaryQueryRef.current = null;
      return;
    }
    if (lastDailySummaryQueryRef.current === visibleDayKeysRequestKey) {
      return;
    }
    lastDailySummaryQueryRef.current = visibleDayKeysRequestKey;

    let canceled = false;
    const abortController = new AbortController();

    async function loadDailySummary() {
      try {
        const response = await fetch(
          `/api/log/daily-summary?${visibleDayKeysQuery}&tz=${encodeURIComponent(userTimeZone)}`,
          {
            signal: abortController.signal,
          },
        );
        const payload = (await response.json()) as DailySummaryApiPayload;
        if (!response.ok) {
          throw new Error(
            payload.details || payload.error || "Unable to load daily summary.",
          );
        }
        const nextSummary: Record<
          string,
          {
            total: number;
            deleted: number;
            restored: number;
            hashChanged: number;
          }
        > = {};
        (payload.days ?? []).forEach((day) => {
          nextSummary[day.day_key] = {
            total: day.total,
            deleted: day.deleted,
            restored: day.restored,
            hashChanged: day.hash_changed,
          };
        });
        if (!canceled) {
          setDailySummaryByDayKey(nextSummary);
        }
      } catch {
        if (canceled || abortController.signal.aborted) {
          return;
        }
        lastDailySummaryQueryRef.current = null;
      }
    }

    void loadDailySummary();
    return () => {
      canceled = true;
      abortController.abort();
    };
  }, [userTimeZone, visibleDayKeysQuery, visibleDayKeysRequestKey]);

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

      {/* <section className="panel detail-nav link-bar">
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
        <span className="log-summary">
          {items.length.toLocaleString("en-US")} entries loaded
        </span>
      </section> */}

      <section className="panel log-feed-panel log-feed-panel-compact">
        {loadError ? (
          <p className="empty">Could not load log entries: {loadError}</p>
        ) : null}
        {items.length === 0 && !loadError ? (
          <p className="empty">
            No rows were found in{" "}
            <span className="mono">public.files_change_log</span>.
          </p>
        ) : (
          <>
            <section
              className="log-weekly-chart"
              aria-label="Changes over the last 7 days"
            >
              <header className="log-weekly-chart-head">
                <h2>Last 7 Days</h2>
                <p>
                  {weeklySeries[0]?.title} -{" "}
                  {weeklySeries[weeklySeries.length - 1]?.title}
                </p>
              </header>
              <div className="log-weekly-summary-grid">
                <article className="log-weekly-summary-card">
                  <span className="log-weekly-summary-value">
                    {weeklyTotal.toLocaleString("en-US")}
                  </span>
                  <span className="log-weekly-summary-label">
                    Total changes
                  </span>
                </article>
                <article className="log-weekly-summary-card">
                  <span className="log-weekly-summary-value">
                    {weeklyDeletedTotal.toLocaleString("en-US")}
                  </span>
                  <span className="log-weekly-summary-label">Deleted</span>
                </article>
                <article className="log-weekly-summary-card">
                  <span className="log-weekly-summary-value">
                    {weeklyRestoredTotal.toLocaleString("en-US")}
                  </span>
                  <span className="log-weekly-summary-label">Restored</span>
                </article>
                <article className="log-weekly-summary-card">
                  <span className="log-weekly-summary-value">
                    {weeklyHashChangedTotal.toLocaleString("en-US")}
                  </span>
                  <span className="log-weekly-summary-label">
                    Change detected
                  </span>
                </article>
              </div>
              {peakDay ? (
                <p className="log-weekly-peak-day">
                  Peak day: {peakDay.title} (
                  {peakDay.total.toLocaleString("en-US")} changes)
                </p>
              ) : null}
              {weeklyError ? (
                <p className="log-weekly-chart-error">{weeklyError}</p>
              ) : null}
              <div
                className="log-weekly-chart-bars"
                role="img"
                aria-label="Bar chart of changes by day for the last seven days"
              >
                {weeklySeries.map((day) => {
                  const heightRatio = weeklyMax > 0 ? day.total / weeklyMax : 0;
                  const barHeight =
                    heightRatio > 0 ? Math.max(heightRatio * 100, 10) : 0;
                  return (
                    <div
                      key={day.dayKey}
                      className="log-weekly-chart-day"
                      title={`${day.title}: ${day.total} changes (${day.deleted} deleted, ${day.restored} restored`}
                    >
                      <div className="log-weekly-chart-track">
                        <div
                          className="log-weekly-chart-bar"
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                      <span className="log-weekly-chart-breakdown">
                        <span className="log-weekly-chart-breakdown-neg">
                          -{day.deleted.toLocaleString("en-US")}
                        </span>
                        <span className="log-weekly-chart-breakdown-pos">
                          +{day.restored.toLocaleString("en-US")}
                        </span>
                      </span>
                      <span className="log-weekly-chart-label">
                        {day.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
            {groupedItems.map((group) => {
              const dbSummary = dailySummaryByDayKey[group.dayKey];
              const summary = dbSummary
                ? {
                    total: dbSummary.total,
                    deleted: dbSummary.deleted,
                    restored: dbSummary.restored,
                    hashChanged: dbSummary.hashChanged,
                  }
                : {
                    total: group.items.length,
                    deleted: group.deletedCount,
                    restored: group.restoredCount,
                    hashChanged: group.hashChangedCount,
                  };
              return (
                <section key={group.dayKey} className="log-day-group">
                  <header className="log-day-header">
                    <h3>{group.dayLabel}</h3>
                    <p>
                      {summary.total.toLocaleString("en-US")} total changes
                      {" • "}
                      {summary.deleted.toLocaleString("en-US")} deleted
                      {" • "}
                      {summary.restored.toLocaleString("en-US")} restored
                    </p>
                  </header>
                  <ol className="log-feed-list log-feed-list-compact">
                    {group.items.map(({ item, index }) => {
                      const changedAtLabel = formatDateTime(
                        item.changed_at,
                        userTimeZone,
                      );
                      const changeKind = changeKindLabel(item.change_kind);
                      const hashLabel = hashStatusLabel(
                        item.hash_matches_original,
                        item.exists_in_files,
                      );
                      const description = trimDescription(item.description);

                      const datasetLabel = formatDatasetLabel(item.dataset);
                      const dataset = datasetLabel ? (
                        <span className="log-entry-dataset">
                          {datasetLabel}
                        </span>
                      ) : null;

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
                                  item.change_kind === "deleted"
                                    ? "badge-danger"
                                    : "badge-ok"
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
                            {dataset}
                            <p className="log-entry-description">
                              {description}
                            </p>
                            <div className="log-entry-meta-line">
                              <span>
                                {changedAtLabel ?? "Time unavailable"}
                              </span>
                              <span className="log-dot">•</span>
                              <span className="table-link">Open document</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </>
        )}

        {items.length > 0 && hasMore ? (
          <div
            ref={loadMoreRef}
            className="results-infinite-trigger"
            aria-hidden="true"
          />
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
