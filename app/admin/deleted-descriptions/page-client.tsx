"use client";

import { useEffect, useMemo, useState } from "react";

type AdminDeletedRow = {
  efta_id: string;
  dataset: string | null;
  vote_count: number;
  original_link: string | null;
  document_description: string | null;
};

export default function AdminDeletedDescriptionsClient() {
  const [rows, setRows] = useState<AdminDeletedRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/deleted-descriptions?limit=200");
        const payload = (await response.json()) as {
          rows?: AdminDeletedRow[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load admin rows");
        }
        const nextRows = payload.rows ?? [];
        setRows(nextRows);
        setDrafts(
          nextRows.reduce<Record<string, string>>((acc, row) => {
            acc[row.efta_id] = row.document_description ?? "";
            return acc;
          }, {}),
        );
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const dirtyIds = useMemo(
    () =>
      new Set(
        rows
          .filter(
            (row) =>
              (row.document_description ?? "") !== (drafts[row.efta_id] ?? ""),
          )
          .map((row) => row.efta_id),
      ),
    [drafts, rows],
  );

  async function saveRow(eftaId: string) {
    setSavingId(eftaId);
    setError(null);
    try {
      const response = await fetch("/api/admin/deleted-descriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eftaId,
          documentDescription: drafts[eftaId] ?? "",
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        documentDescription?: string | null;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Save failed");
      }
      setRows((prev) =>
        prev.map((row) =>
          row.efta_id === eftaId
            ? {
                ...row,
                document_description: payload.documentDescription ?? null,
              }
            : row,
        ),
      );
      setDrafts((prev) => ({
        ...prev,
        [eftaId]: payload.documentDescription ?? "",
      }));
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Admin</p>
        <h1>Deleted Description Editor</h1>
        <p className="subtitle">
          Edit cached descriptions for most upvoted deleted docs.
        </p>
      </section>

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong> {error}
        </section>
      )}

      <section className="panel">
        <header className="results-head">
          <h2>Top Upvoted Deleted Docs</h2>
          <p>{loading ? "Loading..." : `${rows.length} rows`}</p>
        </header>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EFTA ID</th>
                <th>Dataset</th>
                <th>Upvotes</th>
                <th>Description</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isDirty = dirtyIds.has(row.efta_id);
                const isSaving = savingId === row.efta_id;
                return (
                  <tr key={row.efta_id}>
                    <td className="mono">
                      {row.original_link ? (
                        <a
                          href={row.original_link}
                          className="table-link"
                          onClick={(event) => {
                            event.preventDefault();
                            setPreviewTitle(row.efta_id);
                            setPreviewUrl(row.original_link);
                          }}
                        >
                          {row.efta_id}
                        </a>
                      ) : (
                        row.efta_id
                      )}
                    </td>
                    <td>{row.dataset ?? "-"}</td>
                    <td className="mono">{row.vote_count}</td>
                    <td className="admin-description-cell">
                      <textarea
                        className="admin-description-input"
                        value={drafts[row.efta_id] ?? ""}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.efta_id]: event.target.value,
                          }))
                        }
                        rows={4}
                        placeholder="No cached description"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void saveRow(row.efta_id)}
                        disabled={!isDirty || isSaving}
                      >
                        {isSaving ? "Saving..." : isDirty ? "Save" : "Saved"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && rows.length === 0 ? (
            <p className="empty">No rows found.</p>
          ) : null}
        </div>
      </section>

      {previewUrl ? (
        <div
          className="pdf-modal-backdrop"
          onClick={() => setPreviewUrl(null)}
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
                <button type="button" onClick={() => setPreviewUrl(null)}>
                  Close
                </button>
              </div>
            </header>
            <div className="pdf-modal-body">
              <div className="pdf-modal-frame-wrap">
                <iframe
                  src={`${previewUrl}${previewUrl.includes("#") ? "&" : "#"}page=1&view=FitH&zoom=page-width&scrollbar=1&pagemode=none`}
                  title={previewTitle || "PDF Preview"}
                  className="pdf-modal-frame"
                />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
