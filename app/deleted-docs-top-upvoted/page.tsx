"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MobileChunkedPdfModal from "@/components/mobile-chunked-pdf-modal";

type TopDeletedDoc = {
  efta_id: string;
  dataset: string | null;
  file_path: string | null;
  original_link: string | null;
  doj_link: string | null;
  thumbnail_url: string | null;
  document_description: string | null;
  vote_count: number;
  last_voted_at: string;
  userVoted: boolean;
  userBookmarked: boolean;
};

const TOP_LIMIT = 100;
const topRequestCache = new Map<string, Promise<TopDeletedDoc[]>>();

async function fetchTopDeletedDocs(voterId: string) {
  const cacheKey = voterId.trim();
  const cached = topRequestCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const response = await fetch(`/api/deleted-browser/top?limit=${TOP_LIMIT}`, {
      headers: cacheKey ? { "x-voter-id": cacheKey } : {},
    });
    const payload = (await response.json()) as {
      results?: TopDeletedDoc[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load top deleted docs");
    }
    return payload.results ?? [];
  })();

  topRequestCache.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    topRequestCache.delete(cacheKey);
    throw error;
  }
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

export default function DeletedDocsTopUpvotedPage() {
  const restoreKey = "restore:deleted-docs-top-upvoted";
  const [results, setResults] = useState<TopDeletedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewEftaId, setPreviewEftaId] = useState<string | null>(null);
  const [voterId, setVoterId] = useState("");
  const [votingEftaId, setVotingEftaId] = useState<string | null>(null);
  const [bookmarkingEftaId, setBookmarkingEftaId] = useState<string | null>(null);
  const [bookmarkTotal, setBookmarkTotal] = useState<number | null>(null);
  const [hiddenThumbnails, setHiddenThumbnails] = useState<Record<string, true>>({});
  const pageSize = 25;
  const [pendingScrollY, setPendingScrollY] = useState<number | null>(null);

  useEffect(() => {
    const key = "deleted_doc_voter_id";
    let id = "";
    try {
      id = window.localStorage.getItem(key) ?? "";
      if (!id) {
        id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
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
      if (typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)) {
        setPendingScrollY(Math.max(0, Math.floor(parsed.scrollY)));
      }
    } catch {
      // Non-blocking.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTop() {
      setLoading(true);
      setError(null);
      try {
        const nextResults = await fetchTopDeletedDocs(voterId);
        if (!cancelled) {
          setResults(nextResults);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadTop();
    return () => {
      cancelled = true;
    };
  }, [voterId]);

  useEffect(() => {
    if (!voterId) {
      return;
    }
    async function loadBookmarkTotal() {
      try {
        const response = await fetch("/api/deleted-browser/bookmarks?limit=1", {
          headers: { "x-voter-id": voterId },
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { totalBookmarks?: number };
        setBookmarkTotal(
          typeof payload.totalBookmarks === "number" ? payload.totalBookmarks : 0,
        );
      } catch {
        // Non-blocking
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
        setPreviewEftaId(null);
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

  function openPreview(result: TopDeletedDoc) {
    const normalized = result.efta_id.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    setPreviewTitle(`Document Viewer - ${normalized}`);
    setPreviewUrl(`/api/pdf/${encodeURIComponent(normalized)}`);
    setPreviewEftaId(result.efta_id);
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

  function goToPage(nextPage: number) {
    if (nextPage === page) {
      return;
    }
    setPage(nextPage);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }

  async function onUpvote(result: TopDeletedDoc) {
    setVotingEftaId(result.efta_id);
    setError(null);
    try {
      const response = await fetch("/api/deleted-browser/upvote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          eftaId: result.efta_id,
          dataset: result.dataset,
          filePath: result.file_path,
          originalLink: result.original_link,
          dojLink: result.doj_link,
        }),
      });
      const payload = (await response.json()) as { voteCount?: number };
      if (!response.ok) {
        throw new Error("Failed to upvote deleted doc");
      }

      setResults((prev) =>
        prev.map((item) =>
          item.efta_id === result.efta_id
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
      setVotingEftaId(null);
    }
  }

  async function onBookmark(result: TopDeletedDoc) {
    setBookmarkingEftaId(result.efta_id);
    setError(null);
    try {
      const response = await fetch("/api/deleted-browser/bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          eftaId: result.efta_id,
          dataset: result.dataset,
          filePath: result.file_path,
          sources: {
            original_link: result.original_link,
            doj_link: result.doj_link,
          },
          note: null,
        }),
      });
      const payload = (await response.json()) as { totalBookmarks?: number };
      if (!response.ok) {
        throw new Error("Failed to bookmark deleted doc");
      }
      if (typeof payload.totalBookmarks === "number") {
        setBookmarkTotal(payload.totalBookmarks);
      }

      setResults((prev) =>
        prev.map((item) =>
          item.efta_id === result.efta_id
            ? {
                ...item,
                userBookmarked: true,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBookmarkingEftaId(null);
    }
  }

  return (
    <main className="app-shell">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="hero">
        <p className="eyebrow">Community</p>
        <h1>Most Upvoted Deleted Docs</h1>
        <p className="subtitle">Global ranking based on deleted-doc upvotes.</p>
      </section>

      <section className="panel detail-nav link-bar">
        <Link href="/deleted-docs-browser" className="table-link">
          Back to Deleted Browser
        </Link>
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
        <Link href="/deleted-docs-my-upvotes" className="table-link link-right">
          View My Upvotes
        </Link>
        <Link href="/deleted-docs-bookmarks" className="table-link">
          View Bookmarks
          {typeof bookmarkTotal === "number" ? ` (${bookmarkTotal})` : ""}
        </Link>
      </section>

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong> {error}
        </section>
      )}

      <section className="panel deleted-top-results-panel">
        <header className="results-head">
          <h2>Top Deleted Docs</h2>
          <p>{loading ? "Loading..." : `${results.length} ranked items`}</p>
        </header>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Preview</th>
                <th>EFTA ID</th>
                <th>Dataset</th>
                <th>Description</th>
                <th>Original Link</th>
                <th className="nowrap">Upvotes</th>
                <th>Last Upvoted</th>
              </tr>
            </thead>
            <tbody>
              {pagedResults.map((result, index) => (
                <tr key={result.efta_id}>
                  <td className="mono">{startIndex + index + 1}</td>
                  <td className="deleted-thumb-cell">
                    {result.thumbnail_url && !hiddenThumbnails[result.efta_id] ? (
                      <Image
                        src={result.thumbnail_url}
                        alt={`${result.efta_id} thumbnail`}
                        className="deleted-thumb"
                        width={160}
                        height={220}
                        unoptimized
                        loading="lazy"
                        onError={() =>
                          setHiddenThumbnails((prev) => ({
                            ...prev,
                            [result.efta_id]: true,
                          }))
                        }
                      />
                    ) : (
                      <span className="mono">-</span>
                    )}
                  </td>
                  <td className="mono">{result.efta_id}</td>
                  <td>{result.dataset ?? "-"}</td>
                  <td className="deleted-doc-description-cell">
                    <p className="deleted-doc-description">
                      {result.document_description ?? "-"}
                    </p>
                  </td>
                  <td>
                    {result.original_link ? (
                      <a
                        href={result.original_link}
                        className="table-link"
                        onClick={(event) => {
                          event.preventDefault();
                          openPreview(result);
                        }}
                      >
                        Open PDF
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="nowrap">
                    <div className="action-buttons">
                      <button
                        type="button"
                        onClick={() => void onUpvote(result)}
                        disabled={result.userVoted || votingEftaId === result.efta_id}
                      >
                        ▲ {result.vote_count}
                      </button>
                      <button
                        type="button"
                        className="bookmark-btn"
                        onClick={() => void onBookmark(result)}
                        disabled={
                          result.userBookmarked ||
                          bookmarkingEftaId === result.efta_id
                        }
                      >
                        <span className="bookmark-content">
                          <BookmarkIcon saved={result.userBookmarked} />
                          <span className="mono">{bookmarkTotal ?? 0}</span>
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
            <p className="empty">No upvoted deleted docs yet.</p>
          )}
        </div>
        <div className="mobile-result-list">
          {pagedResults.map((result, index) => (
            <article key={`${result.efta_id}-mobile`} className="mobile-result-card">
              <p className="mobile-result-rank mono">#{startIndex + index + 1}</p>
              <a
                href={result.original_link ?? "#"}
                className="table-link mobile-result-title"
                onClick={(event) => {
                  event.preventDefault();
                  openPreview(result);
                }}
              >
                {result.efta_id}
              </a>
              <p className="mobile-result-line">
                <strong>Dataset:</strong> {result.dataset ?? "-"}
              </p>
              <p className="mobile-result-line">
                <strong>Description:</strong> {result.document_description ?? "-"}
              </p>
              <div className="mobile-result-meta">
                <button
                  type="button"
                  onClick={() => void onUpvote(result)}
                  disabled={result.userVoted || votingEftaId === result.efta_id}
                >
                  ▲ {result.vote_count}
                </button>
                <button
                  type="button"
                  className="bookmark-btn"
                  onClick={() => void onBookmark(result)}
                  disabled={
                    result.userBookmarked || bookmarkingEftaId === result.efta_id
                  }
                >
                  <span className="bookmark-content">
                    <BookmarkIcon saved={result.userBookmarked} />
                    <span className="mono">{bookmarkTotal ?? 0}</span>
                  </span>
                </button>
              </div>
              <p className="mobile-result-line">
                <strong>Last Upvoted:</strong> {asDate(result.last_voted_at)}
              </p>
            </article>
          ))}
          {!loading && results.length === 0 && (
            <p className="empty">No upvoted deleted docs yet.</p>
          )}
        </div>
        <div className="pagination">
          <button
            onClick={() => goToPage(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
          >
            Previous
          </button>
          {pageButtons.map((p) => (
            <button
              key={p}
              className={`page-number-btn${p === page ? " active-page" : ""}`}
              onClick={() => goToPage(p)}
              disabled={loading || p === page}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
            disabled={loading || page >= totalPages}
          >
            Next
          </button>
        </div>
      </section>

      {previewUrl ? (
        <MobileChunkedPdfModal
          sourceUrl={previewUrl}
          title={previewTitle}
          kicker="Document Viewer"
          eftaId={previewEftaId ?? ""}
          voteUrl={previewUrl}
          voteTitle={previewEftaId ?? undefined}
          voteFileName={previewEftaId ? `${previewEftaId}.pdf` : undefined}
          onClose={() => {
            setPreviewUrl(null);
            setPreviewTitle("");
            setPreviewEftaId(null);
          }}
        />
      ) : null}
    </main>
  );
}
