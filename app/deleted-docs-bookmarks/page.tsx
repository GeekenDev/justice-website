"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DeletedBookmark = {
  efta_id: string;
  dataset: string | null;
  file_path: string | null;
  original_link: string | null;
  doj_link: string | null;
  created_at: string;
};

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

export default function DeletedDocsBookmarksPage() {
  const [results, setResults] = useState<DeletedBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voterId, setVoterId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewEftaId, setPreviewEftaId] = useState<string | null>(null);
  const [showNoteSidebar, setShowNoteSidebar] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>({});

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
    if (!voterId) {
      return;
    }
    async function loadBookmarks() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/deleted-browser/bookmarks?limit=500", {
          headers: { "x-voter-id": voterId },
        });
        const payload = (await response.json()) as {
          results?: DeletedBookmark[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load bookmarks");
        }
        setResults(payload.results ?? []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    void loadBookmarks();
  }, [voterId]);

  useEffect(() => {
    if (!previewEftaId) {
      setShowNoteSidebar(false);
      setNoteDraft("");
      return;
    }
    setNoteDraft(bookmarkNotes[previewEftaId] ?? "");
  }, [bookmarkNotes, previewEftaId]);

  useEffect(() => {
    if (!previewEftaId || !voterId) {
      return;
    }
    const currentEftaId = previewEftaId;
    let cancelled = false;
    async function loadNoteForPreview() {
      try {
        const params = new URLSearchParams({ eftaId: currentEftaId }).toString();
        const response = await fetch(`/api/deleted-browser/bookmark?${params}`, {
          headers: { "x-voter-id": voterId },
        });
        if (!response.ok || cancelled) {
          return;
        }
        const payload = (await response.json()) as { note?: string | null };
        const note = payload.note ?? "";
        setBookmarkNotes((prev) => ({ ...prev, [currentEftaId]: note }));
        setShowNoteSidebar(note.trim().length > 0);
      } catch {
        // Non-blocking.
      }
    }
    void loadNoteForPreview();
    return () => {
      cancelled = true;
    };
  }, [previewEftaId, voterId]);

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

  const previewResult = previewEftaId
    ? results.find((item) => item.efta_id === previewEftaId) ?? null
    : null;
  const noteKey = previewEftaId ?? "";
  const savedNote = noteKey ? (bookmarkNotes[noteKey] ?? "") : "";
  const isNoteDirty = noteDraft !== savedNote;

  async function onOpenNotes() {
    if (!previewEftaId) {
      return;
    }
    setShowNoteSidebar((prev) => !prev);
    setNoteLoading(true);
    try {
      const params = new URLSearchParams({ eftaId: previewEftaId! }).toString();
      const response = await fetch(`/api/deleted-browser/bookmark?${params}`, {
        headers: voterId ? { "x-voter-id": voterId } : {},
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { note?: string | null };
      setBookmarkNotes((prev) => ({
        ...prev,
        [previewEftaId]: payload.note ?? "",
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
      const response = await fetch("/api/deleted-browser/bookmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(voterId ? { "x-voter-id": voterId } : {}),
        },
        body: JSON.stringify({
          eftaId: previewResult.efta_id,
          dataset: previewResult.dataset,
          filePath: previewResult.file_path,
          sources: {
            original_link: previewResult.original_link,
            doj_link: previewResult.doj_link,
          },
          note: noteDraft,
        }),
      });
      const payload = (await response.json()) as { note?: string | null };
      if (!response.ok) {
        throw new Error("Failed to save note");
      }
      setBookmarkNotes((prev) => ({
        ...prev,
        [previewResult.efta_id]: payload.note ?? noteDraft,
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
        <h1>My Deleted Doc Bookmarks</h1>
        <p className="subtitle">Saved deleted documents for quick review.</p>
      </section>

      <section className="panel detail-nav link-bar">
        <Link href="/deleted-docs-browser" className="table-link">
          Back to Deleted Browser
        </Link>
        <Link href="/deleted-docs-top-upvoted" className="table-link">
          Most Upvoted
        </Link>
      </section>

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong> {error}
        </section>
      )}

      <section className="panel deleted-bookmarks-panel">
        <header className="results-head">
          <h2>Bookmarks</h2>
          <p>{loading ? "Loading..." : `${results.length} saved`}</p>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EFTA ID</th>
                <th>Dataset</th>
                <th>Open PDF</th>
                <th>Saved At</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const pdfUrl = result.original_link ?? result.doj_link;
                return (
                  <tr key={result.efta_id}>
                    <td className="mono">{result.efta_id}</td>
                    <td>{result.dataset ?? "-"}</td>
                    <td>
                      {pdfUrl ? (
                        <a
                          href={pdfUrl}
                          className="table-link"
                          onClick={(event) => {
                            event.preventDefault();
                            setPreviewTitle(result.efta_id);
                            setPreviewUrl(pdfUrl);
                            setPreviewEftaId(result.efta_id);
                          }}
                        >
                          Open PDF
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{asDate(result.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && results.length === 0 && <p className="empty">No bookmarks yet.</p>}
        </div>
        <div className="mobile-result-list">
          {results.map((result) => {
            const pdfUrl = result.original_link ?? result.doj_link;
            return (
              <article key={`${result.efta_id}-mobile`} className="mobile-result-card">
                <a
                  href={pdfUrl ?? "#"}
                  className="table-link mobile-result-title"
                  onClick={(event) => {
                    event.preventDefault();
                    if (!pdfUrl) {
                      return;
                    }
                    setPreviewTitle(result.efta_id);
                    setPreviewUrl(pdfUrl);
                    setPreviewEftaId(result.efta_id);
                  }}
                >
                  {result.efta_id}
                </a>
                <p className="mobile-result-line">
                  <strong>Dataset:</strong> {result.dataset ?? "-"}
                </p>
                <p className="mobile-result-line">
                  <strong>Saved At:</strong> {asDate(result.created_at)}
                </p>
              </article>
            );
          })}
          {!loading && results.length === 0 && <p className="empty">No bookmarks yet.</p>}
        </div>
      </section>

      {previewUrl && (
        <div
          className="pdf-modal-backdrop"
          onClick={() => {
            setPreviewUrl(null);
            setPreviewEftaId(null);
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
                  disabled={!previewEftaId}
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
                    setPreviewEftaId(null);
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
