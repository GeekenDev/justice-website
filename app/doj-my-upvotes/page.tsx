"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MyDojResult = {
  result_url: string;
  title: string | null;
  file_name: string | null;
  snippet: string | null;
  highlight: string | null;
  file_size: number | null;
  vote_count: number;
  last_voted_at: string;
  sources: {
    original_link: string | null;
    doj_link: string | null;
  };
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

export default function DOJMyUpvotesPage() {
  const [results, setResults] = useState<MyDojResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voterId, setVoterId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewResultUrl, setPreviewResultUrl] = useState<string | null>(null);
  const [showNoteSidebar, setShowNoteSidebar] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>({});

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
    if (!voterId) {
      return;
    }

    async function loadMine() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/doj-search/mine?limit=200", {
          headers: { "x-voter-id": voterId },
        });
        const payload = (await response.json()) as {
          results?: MyDojResult[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load your upvotes");
        }
        setResults(payload.results ?? []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    void loadMine();
  }, [voterId]);

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
        const params = new URLSearchParams({ url: currentResultUrl }).toString();
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

  const previewResult = previewResultUrl
    ? results.find((item) => item.result_url === previewResultUrl) ?? null
    : null;
  const noteKey = previewResultUrl ?? "";
  const savedNote = noteKey ? (bookmarkNotes[noteKey] ?? "") : "";
  const isNoteDirty = noteDraft !== savedNote;

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
      const response = await fetch("/api/doj-search/bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          url: previewResult.result_url,
          title: previewResult.title,
          fileName: previewResult.file_name,
          snippet: previewResult.snippet,
          highlight: previewResult.highlight,
          fileSize: previewResult.file_size,
          sources: previewResult.sources,
          note: noteDraft,
        }),
      });
      const payload = (await response.json()) as { note?: string | null };
      if (!response.ok) {
        throw new Error("Failed to save note");
      }
      setBookmarkNotes((prev) => ({
        ...prev,
        [previewResult.result_url]: payload.note ?? noteDraft,
      }));
    } catch (err) {
      setError(String(err));
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
        <h1>My Search Result Upvotes</h1>
        <p className="subtitle">Your previously upvoted DOJ search results.</p>
      </section>

      <section className="panel detail-nav link-bar">
        <Link href="/doj-search" className="table-link">
          Back to DOJ Search
        </Link>
        <Link href="/doj-top-upvoted" className="table-link">
          Most Upvoted
        </Link>
      </section>

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong> {error}
        </section>
      )}

      <section className="panel">
        <header className="results-head">
          <h2>My Upvotes</h2>
          <p>{loading ? "Loading..." : `${results.length} items`}</p>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th className="nowrap">Size</th>
                <th>Snippet</th>
                <th className="nowrap">Upvotes</th>
                <th>Last Upvoted</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.result_url}>
                  <td>
                    <a
                      href={result.sources.original_link ?? result.result_url}
                      className="table-link"
                      onClick={(event) => {
                        event.preventDefault();
                        setPreviewTitle(
                          result.file_name ?? result.title ?? result.result_url,
                        );
                        setPreviewUrl(result.sources.original_link ?? result.result_url);
                        setPreviewResultUrl(result.result_url);
                      }}
                    >
                      {result.file_name ?? result.title ?? result.result_url}
                    </a>
                  </td>
                  <td className="nowrap">{formatFileSize(result.file_size)}</td>
                  <td>{result.snippet ?? "-"}</td>
                  <td className="mono">{result.vote_count}</td>
                  <td>{asDate(result.last_voted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && results.length === 0 && (
            <p className="empty">No upvotes yet.</p>
          )}
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
            <div className={`pdf-modal-body${showNoteSidebar ? " has-note-sidebar" : ""}`}>
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
                  {noteLoading ? <p className="empty">Loading note...</p> : null}
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
                    {noteSaving ? "Saving..." : isNoteDirty ? "Save Note" : "Saved"}
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
