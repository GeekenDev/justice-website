"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { extractEftaId } from "@/lib/client/efta";
import { isMobileSafari } from "@/lib/client/is-mobile-safari";
import { openMobilePdfPreservingPage } from "@/lib/client/open-mobile-pdf";

type TopResult = {
  result_url: string;
  title: string | null;
  file_name: string | null;
  snippet: string | null;
  highlight: string | null;
  file_size: number | null;
  vote_count: number;
  bookmarkCount: number;
  last_voted_at: string;
  sources: {
    original_link: string | null;
    doj_link: string | null;
  };
  userVoted: boolean;
  userBookmarked: boolean;
};

function formatFileSize(bytes: number | null) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function asDate(value: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
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

export default function DOJTopUpvotedPage() {
  const restoreKey = "restore:doj-top-upvoted";
  const [results, setResults] = useState<TopResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [voterId, setVoterId] = useState("");
  const [votingUrl, setVotingUrl] = useState<string | null>(null);
  const [bookmarkingUrl, setBookmarkingUrl] = useState<string | null>(null);
  const [bookmarkTotal, setBookmarkTotal] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewResultUrl, setPreviewResultUrl] = useState<string | null>(null);
  const [showNoteSidebar, setShowNoteSidebar] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>(
    {},
  );
  const pageSize = 25;
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
      const parsed = JSON.parse(raw) as { page?: number; scrollY?: number };
      if (typeof parsed.page === "number" && Number.isFinite(parsed.page)) {
        setPage(Math.max(1, Math.floor(parsed.page)));
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
    async function loadTop() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/doj-search/top?limit=100", {
          headers: voterId ? { "x-voter-id": voterId } : {},
        });
        const payload = (await response.json()) as {
          results?: TopResult[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            payload.error || "Failed to load top upvoted results",
          );
        }
        setResults(payload.results ?? []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    void loadTop();
  }, [voterId]);

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
        // Non-blocking.
      }
    }
    void loadBookmarkTotal();
  }, [voterId]);

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewUrl(null);
        setPreviewResultUrl(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl || typeof document === "undefined") {
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
  }, [previewUrl]);

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

  const previewResult = previewResultUrl
    ? (results.find((item) => item.result_url === previewResultUrl) ?? null)
    : null;
  const noteKey = previewResultUrl ?? "";
  const savedNote = noteKey ? (bookmarkNotes[noteKey] ?? "") : "";
  const isNoteDirty = noteDraft !== savedNote;
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const pagedResults = useMemo(
    () => results.slice(startIndex, startIndex + pageSize),
    [results, startIndex],
  );
  const pageButtons = useMemo(() => {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    const buttons: number[] = [];
    for (let p = start; p <= end; p += 1) {
      buttons.push(p);
    }
    return buttons;
  }, [page, totalPages]);

  function openPreview(result: TopResult) {
    const sourceUrl = result.sources.original_link ?? result.result_url;
    const eftaId = extractEftaId(
      result.file_name ?? result.title ?? result.result_url,
    );
    if (isMobileSafari() && sourceUrl) {
      openMobilePdfPreservingPage(
        eftaId ? `/documents/${encodeURIComponent(eftaId)}` : sourceUrl,
        {
          key: restoreKey,
          value: { page, scrollY: window.scrollY },
        },
      );
      return;
    }
    setPreviewTitle(result.file_name ?? result.title ?? result.result_url);
    setPreviewUrl(sourceUrl);
    setPreviewResultUrl(result.result_url);
  }

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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

  async function onUpvote(result: TopResult) {
    setVotingUrl(result.result_url);
    setError(null);
    try {
      const response = await fetch("/api/doj-search/upvote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          url: result.result_url,
          title: result.title,
          fileName: result.file_name,
          snippet: result.snippet,
          highlight: result.highlight,
          fileSize: result.file_size,
        }),
      });
      const payload = (await response.json()) as { voteCount?: number };
      if (!response.ok) {
        throw new Error("Failed to upvote result");
      }

      setResults((prev) =>
        prev.map((item) =>
          item.result_url === result.result_url
            ? {
                ...item,
                vote_count: payload.voteCount ?? item.vote_count,
                userVoted: true,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setVotingUrl(null);
    }
  }

  async function onBookmark(
    result: TopResult,
    options?: { note?: string | null },
  ) {
    setBookmarkingUrl(result.result_url);
    setError(null);
    try {
      const response = await fetch("/api/doj-search/bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          url: result.result_url,
          title: result.title,
          fileName: result.file_name,
          snippet: result.snippet,
          highlight: result.highlight,
          fileSize: result.file_size,
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
        throw new Error("Failed to bookmark result");
      }
      if (typeof payload.totalBookmarks === "number") {
        setBookmarkTotal(payload.totalBookmarks);
      }
      setResults((prev) =>
        prev.map((item) =>
          item.result_url === result.result_url
            ? {
                ...item,
                userBookmarked: true,
                bookmarkCount: payload.bookmarkCount ?? item.bookmarkCount,
              }
            : item,
        ),
      );
      if (typeof payload.note === "string") {
        setBookmarkNotes((prev) => ({
          ...prev,
          [result.result_url]: payload.note ?? "",
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
        <p className="eyebrow">Community</p>
        <h1>Most Upvoted Search Results</h1>
        <p className="subtitle">Global ranking based on user upvotes.</p>
      </section>

      <section className="panel detail-nav link-bar">
        <Link href="/search" className="table-link">
          Back to Advanced Search
        </Link>
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
        <Link href="/doj-my-upvotes" className="table-link link-right">
          View My Upvotes
        </Link>
        <Link href="/doj-bookmarks" className="table-link">
          View Bookmarks
          {typeof bookmarkTotal === "number" ? ` (${bookmarkTotal})` : ""}
        </Link>
      </section>

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong> {error}
        </section>
      )}

      <section className="panel doj-top-results-panel">
        <header className="results-head">
          <h2>Top Results</h2>
          <p>{loading ? "Loading..." : `${results.length} ranked items`}</p>
        </header>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>File</th>
                <th className="nowrap">Size</th>
                <th>Snippet</th>
                <th className="nowrap">Upvotes</th>
                <th>Last Upvoted</th>
              </tr>
            </thead>
            <tbody>
              {pagedResults.map((result, index) => (
                <tr key={result.result_url}>
                  <td className="mono">{startIndex + index + 1}</td>
                  <td>
                    <a
                      href={result.result_url}
                      className="table-link"
                      onClick={(event) => {
                        event.preventDefault();
                        openPreview(result);
                      }}
                    >
                      {result.file_name ?? result.title ?? result.result_url}
                    </a>
                  </td>
                  <td className="nowrap">{formatFileSize(result.file_size)}</td>
                  <td>{result.snippet ?? "-"}</td>
                  <td className="nowrap">
                    <div className="action-buttons">
                      <button
                        type="button"
                        onClick={() => void onUpvote(result)}
                        disabled={
                          result.userVoted || votingUrl === result.result_url
                        }
                      >
                        ▲ {result.vote_count}
                      </button>
                      <button
                        type="button"
                        className="bookmark-btn"
                        onClick={() => void onBookmark(result)}
                        disabled={
                          result.userBookmarked ||
                          bookmarkingUrl === result.result_url
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
                  <td>{asDate(result.last_voted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && results.length === 0 && (
            <p className="empty">No upvoted results yet.</p>
          )}
        </div>
        <div className="mobile-result-list">
          {pagedResults.map((result, index) => (
            <article
              key={`${result.result_url}-mobile`}
              className="mobile-result-card"
            >
              <p className="mobile-result-rank mono">
                #{startIndex + index + 1}
              </p>
              <a
                href={result.result_url}
                className="table-link mobile-result-title"
                onClick={(event) => {
                  event.preventDefault();
                  openPreview(result);
                }}
              >
                {result.file_name ?? result.title ?? result.result_url}
              </a>
              <div className="mobile-result-meta">
                <span className="mono nowrap">
                  Size: {formatFileSize(result.file_size)}
                </span>
                <button
                  type="button"
                  onClick={() => void onUpvote(result)}
                  disabled={result.userVoted || votingUrl === result.result_url}
                >
                  ▲ {result.vote_count}
                </button>
                <button
                  type="button"
                  className="bookmark-btn"
                  onClick={() => void onBookmark(result)}
                  disabled={
                    result.userBookmarked ||
                    bookmarkingUrl === result.result_url
                  }
                >
                  <span className="bookmark-content">
                    <BookmarkIcon saved={result.userBookmarked} />
                    <span className="mono">{result.bookmarkCount ?? 0}</span>
                  </span>
                </button>
              </div>
              <p className="mobile-result-line">
                <strong>Snippet:</strong> {result.snippet ?? "-"}
              </p>
              <p className="mobile-result-line">
                <strong>Last Upvoted:</strong> {asDate(result.last_voted_at)}
              </p>
            </article>
          ))}
          {!loading && results.length === 0 && (
            <p className="empty">No upvoted results yet.</p>
          )}
        </div>
        <div className="pagination">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
          >
            Previous
          </button>
          {pageButtons.map((p) => (
            <button
              key={p}
              className={`page-number-btn${p === page ? " active-page" : ""}`}
              onClick={() => setPage(p)}
              disabled={loading || p === page}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
          >
            Next
          </button>
        </div>
      </section>

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
                        previewResult.userVoted ||
                        votingUrl === previewResult.result_url
                      }
                    >
                      ▲ {previewResult.vote_count}
                    </button>
                    <button
                      type="button"
                      className="bookmark-btn"
                      onClick={() => void onBookmark(previewResult)}
                      disabled={
                        previewResult.userBookmarked ||
                        bookmarkingUrl === previewResult.result_url
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
                  src={`${previewUrl}${previewUrl.includes("#") ? "&" : "#"}page=1&view=FitH&zoom=page-width&scrollbar=1&pagemode=none`}
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
    </main>
  );
}
