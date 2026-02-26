"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { extractEftaId } from "@/lib/client/efta";

type DOJSearchResult = {
  title: string;
  url: string;
  snippet: string | null;
  fileName: string | null;
  highlight: string | null;
  fileSize: number | null;
  documentStatus?: "Original" | "Altered" | "Deleted";
  sources: {
    original_link: string | null;
    doj_link: string | null;
  };
  upvotes: number;
  bookmarkCount: number;
  userVoted: boolean;
  userBookmarked: boolean;
};

type DOJSearchResponse = {
  keys: string;
  page: number;
  url: string;
  ok: boolean;
  blocked: boolean;
  results: DOJSearchResult[];
  resultCount: number;
  total: number | null;
  uniqueCount: number | null;
  pageSize: number | null;
  totalPages: number | null;
  status: number;
  error?: string;
};

function renderHighlightedBits(value: string | null) {
  if (!value) {
    return "-";
  }

  const parts = value.split(/(<em>[\s\S]*?<\/em>)/gi).filter(Boolean);
  return parts.map((part, index) => {
    const match = part.match(/^<em>([\s\S]*?)<\/em>$/i);
    if (match) {
      return (
        <span key={`hl-${index}`} className="highlight-accent">
          {match[1]}
        </span>
      );
    }
    return <span key={`txt-${index}`}>{part}</span>;
  });
}

function getDocumentStatus(result: DOJSearchResult) {
  return result.documentStatus ?? "Original";
}

function getDocumentStatusBadgeClass(
  status: "Original" | "Altered" | "Deleted",
) {
  if (status === "Deleted") {
    return "badge-danger";
  }
  if (status === "Altered") {
    return "badge-altered";
  }
  return "badge-ok";
}

function withPdfZoom(url: string | null) {
  if (!url) {
    return "";
  }
  return `${url}${url.includes("#") ? "&" : "#"}page=1&view=FitH&zoom=page-width&scrollbar=1&pagemode=none`;
}

function isMobileDocumentViewerTarget() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const hasTouch = navigator.maxTouchPoints > 0;
  const likelyMobileUa =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const smallViewport = window.matchMedia("(max-width: 960px)").matches;
  return smallViewport && (hasTouch || likelyMobileUa);
}

function BookmarkIcon({ saved }: { saved: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bookmark-icon">
      <path
        d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bookmark-icon">
      <path
        d="M5 3h10l4 4v14H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M15 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function DOJSearchPage() {
  const restoreKey = "restore:doj-search";
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingMoreRef = useRef(false);
  const [keys, setKeys] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DOJSearchResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [topSuggestions, setTopSuggestions] = useState<string[]>([]);
  const [latestSuggestions, setLatestSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [votingUrl, setVotingUrl] = useState<string | null>(null);
  const [bookmarkingUrl, setBookmarkingUrl] = useState<string | null>(null);
  const [bookmarkTotal, setBookmarkTotal] = useState<number | null>(null);
  const [voterId, setVoterId] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewResultUrl, setPreviewResultUrl] = useState<string | null>(null);
  const [mobileViewerUrl, setMobileViewerUrl] = useState<string | null>(null);
  const [mobileViewerTitle, setMobileViewerTitle] = useState<string>("");
  const [showNoteSidebar, setShowNoteSidebar] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>(
    {},
  );
  const [pendingScrollY, setPendingScrollY] = useState<number | null>(null);

  useEffect(() => {
    const key = "doj_voter_id";
    let id = "";
    try {
      id = window.localStorage.getItem(key) ?? "";
      if (!id) {
        id =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(key, id);
      }
    } catch {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    setVoterId(id);
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(restoreKey);
      if (!raw) {
        return;
      }
      window.sessionStorage.removeItem(restoreKey);
      const parsed = JSON.parse(raw) as {
        keys?: string;
        page?: number;
        data?: DOJSearchResponse | null;
        scrollY?: number;
      };
      if (typeof parsed.keys === "string") {
        setKeys(parsed.keys);
      }
      if (typeof parsed.page === "number" && Number.isFinite(parsed.page)) {
        setPage(Math.max(1, Math.floor(parsed.page)));
      }
      if (parsed.data && typeof parsed.data === "object") {
        setData(parsed.data);
        if (typeof parsed.data.keys === "string" && parsed.data.keys.trim()) {
          setActiveQuery(parsed.data.keys.trim());
        }
      } else if (typeof parsed.keys === "string" && parsed.keys.trim()) {
        setActiveQuery(parsed.keys.trim());
      }
      if (
        typeof parsed.scrollY === "number" &&
        Number.isFinite(parsed.scrollY)
      ) {
        setPendingScrollY(Math.max(0, Math.floor(parsed.scrollY)));
      }
    } catch {
      // Non-blocking.
    }
  }, []);

  useEffect(() => {
    if (!showSuggestions) {
      return;
    }

    const q = keys.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          ...(q ? { q } : {}),
          limit: "10",
        }).toString();
        const response = await fetch(`/api/doj-search/suggestions?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          suggestions?: string[];
          topSuggestions?: string[];
          latestSuggestions?: string[];
        };
        setSuggestions(payload.suggestions ?? []);
        setTopSuggestions(payload.topSuggestions ?? []);
        setLatestSuggestions(payload.latestSuggestions ?? []);
      } catch {
        // Ignore suggestion fetch failures to keep search usable.
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [keys, showSuggestions]);

  const runSearch = useCallback(
    async (
      nextPage = 1,
      queryOverride?: string,
      options?: { append?: boolean },
    ) => {
      const append = Boolean(options?.append);
      const trimmedKeys = (
        queryOverride ?? (append ? activeQuery : keys)
      ).trim();
      if (!trimmedKeys) {
        setError("Search query is required.");
        return;
      }
      if (append && (isFetchingMoreRef.current || loadingMore)) {
        return;
      }

      if (append) {
        isFetchingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const nextQuery = new URLSearchParams({
          keys: trimmedKeys,
          page: String(nextPage),
        }).toString();
        const responseWithVoter = await fetch(`/api/doj-search?${nextQuery}`, {
          headers: voterId ? { "x-voter-id": voterId } : {},
        });
        const payload = (await responseWithVoter.json()) as DOJSearchResponse;
        if (!responseWithVoter.ok) {
          throw new Error(payload.error || "DOJ search request failed");
        }
        if (append) {
          setData((prev) => {
            if (!prev) {
              return payload;
            }
            const seen = new Set(prev.results.map((item) => item.url));
            const appended = payload.results.filter(
              (item) => !seen.has(item.url),
            );
            const mergedResults = [...prev.results, ...appended];
            return {
              ...payload,
              results: mergedResults,
              resultCount: mergedResults.length,
            };
          });
        } else {
          setData(payload);
        }
        setPage(nextPage);
        setActiveQuery(trimmedKeys);
      } catch (err) {
        setError(String(err));
      } finally {
        if (append) {
          setLoadingMore(false);
          isFetchingMoreRef.current = false;
        } else {
          setLoading(false);
        }
      }
    },
    [activeQuery, keys, loadingMore, voterId],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(1);
  }

  function onSuggestionSelect(suggestion: string) {
    setKeys(suggestion);
    setShowSuggestions(false);
    void runSearch(1, suggestion);
  }

  const isQueryingSuggestions = keys.trim().length > 0;
  const showSuggestionMenu =
    showSuggestions &&
    (isQueryingSuggestions
      ? suggestions.length > 0
      : topSuggestions.length > 0 || latestSuggestions.length > 0);

  function onClearQuery() {
    setKeys("");
    setShowSuggestions(true);
    const input = queryInputRef.current;
    if (input && document.activeElement !== input) {
      input.focus();
    }
  }

  useEffect(() => {
    if (
      !data ||
      data.blocked ||
      loading ||
      loadingMore ||
      !activeQuery ||
      typeof data.totalPages !== "number" ||
      page >= data.totalPages
    ) {
      return;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void runSearch(page + 1, activeQuery, { append: true });
        }
      },
      {
        root: null,
        rootMargin: "500px 0px",
        threshold: 0,
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeQuery, data, loading, loadingMore, page, runSearch]);

  useEffect(() => {
    if (!previewUrl && !mobileViewerUrl) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewUrl(null);
        setPreviewResultUrl(null);
        setMobileViewerUrl(null);
        setMobileViewerTitle("");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileViewerUrl, previewUrl]);

  useEffect(() => {
    if ((!previewUrl && !mobileViewerUrl) || typeof document === "undefined") {
      return;
    }
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIOS =
      /iP(hone|ad|od)/.test(ua) ||
      (typeof navigator !== "undefined" &&
        navigator.platform === "MacIntel" &&
        navigator.maxTouchPoints > 1);
    if (isIOS) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileViewerUrl, previewUrl]);

  useEffect(() => {
    if (!previewResultUrl) {
      setShowNoteSidebar(false);
      setNoteDraft("");
      return;
    }
    setNoteDraft(bookmarkNotes[previewResultUrl] ?? "");
  }, [bookmarkNotes, previewResultUrl]);

  useEffect(() => {
    if (!previewResultUrl || !voterId) {
      return;
    }
    const currentResultUrl = previewResultUrl;
    let cancelled = false;
    async function loadNoteForPreview() {
      try {
        const params = new URLSearchParams({
          url: currentResultUrl,
        }).toString();
        const response = await fetch(`/api/doj-search/bookmark?${params}`, {
          headers: { "x-voter-id": voterId },
        });
        if (!response.ok || cancelled) {
          return;
        }
        const payload = (await response.json()) as { note?: string | null };
        const note = payload.note ?? "";
        setBookmarkNotes((prev) => ({ ...prev, [currentResultUrl]: note }));
        setShowNoteSidebar(note.trim().length > 0);
      } catch {
        // Non-blocking.
      }
    }
    void loadNoteForPreview();
    return () => {
      cancelled = true;
    };
  }, [previewResultUrl, voterId]);

  useEffect(() => {
    if (!voterId) {
      return;
    }
    async function loadBookmarkTotal() {
      try {
        const response = await fetch("/api/doj-search/bookmarks?limit=1", {
          headers: { "x-voter-id": voterId },
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { totalBookmarks?: number };
        setBookmarkTotal(
          typeof payload.totalBookmarks === "number"
            ? payload.totalBookmarks
            : 0,
        );
      } catch {
        // Keep search usable even if bookmark total fails to load.
      }
    }
    void loadBookmarkTotal();
  }, [voterId]);

  function openPreview(result: DOJSearchResult) {
    const sourceUrl = result.sources.original_link ?? result.url;
    const eftaId = extractEftaId(result.fileName ?? result.title ?? result.url);
    if (sourceUrl && isMobileDocumentViewerTarget()) {
      setMobileViewerTitle(result.fileName ?? result.title ?? "PDF Viewer");
      setMobileViewerUrl(
        eftaId
          ? `/documents/${encodeURIComponent(eftaId)}`
          : withPdfZoom(sourceUrl),
      );
      return;
    }
    setPreviewTitle(result.fileName ?? result.title);
    setPreviewUrl(sourceUrl);
    setPreviewResultUrl(result.url);
  }

  const previewResult =
    previewResultUrl && data
      ? (data.results.find((result) => result.url === previewResultUrl) ?? null)
      : null;
  const noteKey = previewResultUrl ?? "";
  const savedNote = noteKey ? (bookmarkNotes[noteKey] ?? "") : "";
  const isNoteDirty = noteDraft !== savedNote;

  useEffect(() => {
    if (loading || pendingScrollY === null) {
      return;
    }
    const y = pendingScrollY;
    setPendingScrollY(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
    });
  }, [loading, pendingScrollY]);

  async function onUpvote(result: DOJSearchResult) {
    setVotingUrl(result.url);
    try {
      const response = await fetch("/api/doj-search/upvote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          url: result.url,
          title: result.title,
          fileName: result.fileName,
          snippet: result.snippet,
          highlight: result.highlight,
          fileSize: result.fileSize,
        }),
      });
      const payload = (await response.json()) as {
        voteCount?: number;
        alreadyVoted?: boolean;
      };
      if (!response.ok) {
        throw new Error("Failed to upvote");
      }
      setData((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          results: prev.results.map((item) =>
            item.url === result.url
              ? {
                  ...item,
                  upvotes: payload.voteCount ?? item.upvotes,
                  userVoted: true,
                }
              : item,
          ),
        };
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setVotingUrl(null);
    }
  }

  async function onBookmark(
    result: DOJSearchResult,
    options?: { note?: string | null },
  ) {
    setBookmarkingUrl(result.url);
    try {
      const response = await fetch("/api/doj-search/bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          url: result.url,
          title: result.title,
          fileName: result.fileName,
          snippet: result.snippet,
          highlight: result.highlight,
          fileSize: result.fileSize,
          sources: result.sources,
          note: options?.note ?? null,
        }),
      });
      const payload = (await response.json()) as {
        totalBookmarks?: number;
        bookmarkCount?: number;
        note?: string | null;
      };
      if (!response.ok) {
        throw new Error("Failed to bookmark");
      }
      if (typeof payload.totalBookmarks === "number") {
        setBookmarkTotal(payload.totalBookmarks);
      }
      setData((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          results: prev.results.map((item) =>
            item.url === result.url
              ? {
                  ...item,
                  userBookmarked: true,
                  bookmarkCount: payload.bookmarkCount ?? item.bookmarkCount,
                }
              : item,
          ),
        };
      });
      if (typeof payload.note === "string") {
        setBookmarkNotes((prev) => ({
          ...prev,
          [result.url]: payload.note ?? "",
        }));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBookmarkingUrl(null);
    }
  }

  async function onOpenNotes() {
    if (!previewResultUrl) {
      return;
    }
    setShowNoteSidebar((prev) => !prev);
    setNoteLoading(true);
    try {
      const params = new URLSearchParams({ url: previewResultUrl! }).toString();
      const response = await fetch(`/api/doj-search/bookmark?${params}`, {
        headers: voterId ? { "x-voter-id": voterId } : {},
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { note?: string | null };
      setBookmarkNotes((prev) => ({
        ...prev,
        [previewResultUrl]: payload.note ?? "",
      }));
    } finally {
      setNoteLoading(false);
    }
  }

  async function onSaveNote() {
    if (!previewResult) {
      return;
    }
    setNoteSaving(true);
    try {
      await onBookmark(previewResult, { note: noteDraft });
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="hero">
        <p className="eyebrow">DOJ Search</p>
        <h1>Epstein Files DOJ Search</h1>
        <p className="subtitle">
          Searches the Official Department of Justice endpoint
        </p>
      </section>

      <section className="panel announcement-banner">
        <p>
          New: Try our advanced search experience with hybrid ranking, syntax
          filters, and richer highlights.
        </p>
        <Link href="/search" className="table-link">
          Open Advanced Search
        </Link>
      </section>

      <section className="panel detail-nav link-bar">
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
        <Link href="/doj-top-upvoted" className="table-link">
          Most Upvoted Results
        </Link>
        <Link href="/doj-my-upvotes" className="table-link link-right">
          View My Upvotes
        </Link>
        <Link href="/doj-bookmarks" className="table-link">
          View Bookmarks
          {typeof bookmarkTotal === "number" ? ` (${bookmarkTotal})` : ""}
        </Link>
      </section>

      <section className="panel doj-search-filters-panel">
        <form className="filters doj-search-filters" onSubmit={onSubmit}>
          <label>
            Search Query
            <div className="suggestion-wrap">
              <input
                ref={queryInputRef}
                type="text"
                value={keys}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 120);
                }}
                onChange={(event) => setKeys(event.target.value)}
                placeholder="Search the files"
                autoComplete="off"
              />
              {keys.trim().length > 0 && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onClearQuery}
                  aria-label="Clear search query"
                >
                  ×
                </button>
              )}
              {showSuggestionMenu && (
                <ul className="suggestions-menu" role="listbox">
                  {isQueryingSuggestions ? (
                    <>
                      <li className="suggestions-label">Suggestions</li>
                      {suggestions.map((suggestion) => (
                        <li key={`s-${suggestion}`}>
                          <button
                            type="button"
                            className="suggestion-item"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onSuggestionSelect(suggestion);
                            }}
                          >
                            {suggestion}
                          </button>
                        </li>
                      ))}
                    </>
                  ) : (
                    <>
                      <li className="suggestions-columns">
                        <div className="suggestions-column">
                          <p className="suggestions-label">Top 10 Searches</p>
                          {topSuggestions.map((suggestion) => (
                            <button
                              key={`top-${suggestion}`}
                              type="button"
                              className="suggestion-item"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                onSuggestionSelect(suggestion);
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                        <div className="suggestions-column">
                          <p className="suggestions-label">
                            Latest 10 Searches
                          </p>
                          {latestSuggestions.map((suggestion) => (
                            <button
                              key={`latest-${suggestion}`}
                              type="button"
                              className="suggestion-item"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                onSuggestionSelect(suggestion);
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </li>
                    </>
                  )}
                </ul>
              )}
            </div>
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Searching..." : "Search DOJ"}
          </button>
        </form>
      </section>

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong> {error}
        </section>
      )}

      {data && (
        <section className="panel doj-results-panel">
          <header className="results-head">
            <h2>Results</h2>
            <p>
              {data.resultCount} items
              {typeof data.total === "number" ? ` | total ${data.total}` : ""}
            </p>
          </header>
          <div className="detail-list">
            {data.blocked && (
              <p className="empty">
                Upstream blocked automated fetch for this request. Open the DOJ
                URL directly.
              </p>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th className="nowrap">Status</th>
                  <th>Highlight</th>
                  <th className="nowrap">Upvote</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((result) => (
                  <tr key={result.url}>
                    <td>
                      <a
                        href={result.sources.original_link ?? result.url}
                        className="table-link"
                        onClick={(event) => {
                          event.preventDefault();
                          openPreview(result);
                        }}
                      >
                        {result.fileName ?? result.title}
                      </a>
                    </td>
                    <td className="nowrap">
                      {(() => {
                        const status = getDocumentStatus(result);
                        return (
                          <span
                            className={`badge ${getDocumentStatusBadgeClass(status)}`}
                          >
                            {status}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="mono">
                      {renderHighlightedBits(result.highlight)}
                    </td>
                    <td className="nowrap">
                      <div className="action-buttons">
                        <button
                          type="button"
                          onClick={() => void onUpvote(result)}
                          disabled={
                            votingUrl === result.url || result.userVoted
                          }
                        >
                          ▲ {result.upvotes}
                        </button>
                        <button
                          type="button"
                          className="bookmark-btn"
                          onClick={() => void onBookmark(result)}
                          disabled={
                            bookmarkingUrl === result.url ||
                            result.userBookmarked
                          }
                        >
                          <span className="bookmark-content">
                            <BookmarkIcon saved={result.userBookmarked} />
                            <span className="mono">
                              {result.bookmarkCount ?? 0}
                            </span>
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && data.results.length === 0 && (
              <p className="empty">No parsed results found.</p>
            )}
          </div>
          <div className="mobile-result-list">
            {data.results.map((result) => (
              <article
                key={`${result.url}-mobile`}
                className="mobile-result-card"
              >
                <a
                  href={result.sources.original_link ?? result.url}
                  className="table-link mobile-result-title"
                  onClick={(event) => {
                    event.preventDefault();
                    openPreview(result);
                  }}
                >
                  {result.fileName ?? result.title}
                </a>
                <div className="mobile-result-meta">
                  {(() => {
                    const status = getDocumentStatus(result);
                    return (
                      <span
                        className={`badge ${getDocumentStatusBadgeClass(status)}`}
                      >
                        {status}
                      </span>
                    );
                  })()}
                  <div className="action-buttons">
                    <button
                      type="button"
                      onClick={() => void onUpvote(result)}
                      disabled={votingUrl === result.url || result.userVoted}
                    >
                      ▲ {result.upvotes}
                    </button>
                    <button
                      type="button"
                      className="bookmark-btn"
                      onClick={() => void onBookmark(result)}
                      disabled={
                        bookmarkingUrl === result.url || result.userBookmarked
                      }
                    >
                      <span className="bookmark-content">
                        <BookmarkIcon saved={result.userBookmarked} />
                        <span className="mono">
                          {result.bookmarkCount ?? 0}
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
                <p className="mobile-result-line">
                  <strong>Highlight:</strong>{" "}
                  {renderHighlightedBits(result.highlight)}
                </p>
              </article>
            ))}
            {!loading && data.results.length === 0 && (
              <p className="empty">No parsed results found.</p>
            )}
          </div>
          {!data.blocked &&
            typeof data.totalPages === "number" &&
            page < data.totalPages && (
              <div
                ref={loadMoreRef}
                className="results-infinite-trigger"
                aria-hidden="true"
              />
            )}
          {loadingMore && (
            <p className="results-infinite-status">Loading more results...</p>
          )}
          {!loadingMore &&
            !loading &&
            !data.blocked &&
            typeof data.totalPages === "number" &&
            page >= data.totalPages &&
            data.results.length > 0 && (
              <p className="results-infinite-status">End of results.</p>
            )}
        </section>
      )}

      {previewUrl && (
        <div
          className="pdf-modal-backdrop"
          onClick={() => {
            setPreviewUrl(null);
            setPreviewResultUrl(null);
          }}
          role="presentation"
        >
          <section
            className="pdf-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label={previewTitle || "PDF Preview"}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="pdf-modal-head">
              <h2>{previewTitle || "PDF Preview"}</h2>
              <div className="pdf-modal-actions">
                {previewResult && (
                  <>
                    <button
                      type="button"
                      onClick={() => void onUpvote(previewResult)}
                      disabled={
                        votingUrl === previewResult.url ||
                        previewResult.userVoted
                      }
                    >
                      ▲ {previewResult.upvotes}
                    </button>
                    <button
                      type="button"
                      className="bookmark-btn"
                      onClick={() => void onBookmark(previewResult)}
                      disabled={
                        bookmarkingUrl === previewResult.url ||
                        previewResult.userBookmarked
                      }
                    >
                      <span className="bookmark-content">
                        <BookmarkIcon saved={previewResult.userBookmarked} />
                        <span className="mono">
                          {previewResult.bookmarkCount ?? 0}
                        </span>
                      </span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="bookmark-btn"
                  onClick={() => void onOpenNotes()}
                  disabled={!previewResultUrl}
                >
                  <span className="bookmark-content">
                    <NoteIcon />
                    <span>Note</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    setPreviewResultUrl(null);
                  }}
                >
                  Close
                </button>
              </div>
            </header>
            <div
              className={`pdf-modal-body${showNoteSidebar ? " has-note-sidebar" : ""}`}
            >
              <div className="pdf-modal-frame-wrap">
                <iframe
                  src={withPdfZoom(previewUrl)}
                  title={previewTitle || "PDF Preview"}
                  className="pdf-modal-frame"
                />
              </div>
              {showNoteSidebar && (
                <aside className="note-sidebar">
                  <h3>Bookmark Note</h3>
                  {noteLoading ? (
                    <p className="empty">Loading note...</p>
                  ) : null}
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Add your note for this bookmarked item..."
                    rows={10}
                  />
                  <button
                    type="button"
                    onClick={() => void onSaveNote()}
                    disabled={noteSaving || !isNoteDirty}
                  >
                    {noteSaving
                      ? "Saving..."
                      : isNoteDirty
                        ? "Save Note"
                        : "Saved"}
                  </button>
                </aside>
              )}
            </div>
          </section>
        </div>
      )}

      {mobileViewerUrl && (
        <div
          className="doj-mobile-viewer-backdrop"
          onClick={() => {
            setMobileViewerUrl(null);
            setMobileViewerTitle("");
          }}
          role="presentation"
        >
          <section
            className="doj-mobile-viewer-modal deleted-debug-root deleted-browser-mobile-shell"
            role="dialog"
            aria-modal="true"
            aria-label={mobileViewerTitle || "Mobile PDF Viewer"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="deleted-debug-topbar doj-mobile-viewer-topbar">
              <div className="deleted-debug-top-main">
                <div className="deleted-debug-meta">
                  <p className="deleted-debug-kicker">DOJ Search</p>
                  <p className="deleted-debug-fileline">
                    {mobileViewerTitle || "PDF Viewer"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="doj-mobile-viewer-close"
                onClick={() => {
                  setMobileViewerUrl(null);
                  setMobileViewerTitle("");
                }}
                aria-label="Close viewer"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="doj-mobile-viewer-frame-wrap">
              <iframe
                src={mobileViewerUrl}
                title={mobileViewerTitle || "Mobile PDF Viewer"}
                className="doj-mobile-viewer-frame"
              />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
