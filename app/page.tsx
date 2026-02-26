"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import GlobalNav from "@/components/global-nav";
import { globalNavConfig } from "@/lib/global-nav-config";

type FileRow = {
  efta_id: string;
  parent_efta_id: string | null;
  dataset: string | null;
  file_path: string | null;
  page_count: number | null;
  altered: boolean;
  hidden: boolean;
  deleted: boolean;
  shows_in_search: boolean | null;
  last_checked: string | null;
  doj_website_page: number | null;
  notes: string | null;
  original_hash: string | null;
  current_hash: string | null;
  diff_scan_id?: string | number | null;
};

type StatsPayload = {
  stats: {
    total_files: number;
    altered_files: number;
    hidden_files: number;
    deleted_files: number;
    files_with_parent: number;
    files_without_parent: number;
    distinct_datasets: number;
    avg_page_count: number | null;
    max_page_count: number | null;
    by_dataset: { dataset: string | null; count: number }[];
  };
  datasets: string[];
};

type SearchPayload = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rows: FileRow[];
};

type DetailPayload = {
  file: FileRow;
  parent: FileRow | null;
  children: FileRow[];
};

const initialSearch: SearchPayload = {
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  rows: [],
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US").format(value);
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

function formatPageLabel(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Unknown pages";
  }
  return `${formatNumber(value)} ${value === 1 ? "page" : "pages"}`;
}

function buildOriginalFileLink(row: FileRow) {
  if (!row.dataset || !row.file_path) {
    return null;
  }
  const datasetNumber = Number(row.dataset);
  if (Number.isNaN(datasetNumber)) {
    return null;
  }
  const volume = `VOL${String(datasetNumber).padStart(5, "0")}`;
  let normalizedPath = row.file_path.replace(/^\/+/, "");

  // Dataset 9 originals are hosted without the intermediate IMAGES subfolder.
  if (datasetNumber === 9) {
    const parts = normalizedPath.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1];
    if (fileName) {
      normalizedPath = `IMAGES/${fileName}`;
    }
  }

  return `https://doj-files.geeken.dev/doj_zips/${volume}/${normalizedPath}`;
}

function buildCurrentDojLink(row: FileRow) {
  if (!row.dataset) {
    return null;
  }
  const datasetNumber = Number(row.dataset);
  if (Number.isNaN(datasetNumber)) {
    return null;
  }
  return `https://www.justice.gov/epstein/files/DataSet%20${datasetNumber}/${row.efta_id}.pdf`;
}

function buildChangesLink(row: FileRow) {
  if (row.diff_scan_id === null || row.diff_scan_id === undefined) {
    return null;
  }
  const scanId = String(row.diff_scan_id).trim();
  if (!scanId) {
    return null;
  }
  return `https://change-tracker.geeken.dev/?run=run-${encodeURIComponent(scanId)}`;
}

export default function HomePage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [search, setSearch] = useState<SearchPayload>(initialSearch);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selected, setSelected] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dataset, setDataset] = useState("");
  const [alteredOnly, setAlteredOnly] = useState(false);
  const [deletedOnly, setDeletedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) {
      params.set("q", q.trim());
    }
    if (dataset.trim()) {
      params.set("dataset", dataset.trim());
    }
    params.set("altered", alteredOnly ? "yes" : "all");
    params.set("hidden", "all");
    params.set("deleted", deletedOnly ? "yes" : "all");
    params.set("page", String(page));
    params.set("pageSize", "10");
    return params.toString();
  }, [q, dataset, alteredOnly, deletedOnly, page]);

  useEffect(() => {
    setPage(1);
  }, [q, dataset, alteredOnly, deletedOnly]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const viewportMeta = document.querySelector(
      'meta[name="viewport"]',
    ) as HTMLMetaElement | null;
    if (!viewportMeta) {
      return;
    }
    const previousContent = viewportMeta.getAttribute("content");
    viewportMeta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );
    return () => {
      if (previousContent) {
        viewportMeta.setAttribute("content", previousContent);
      } else {
        viewportMeta.removeAttribute("content");
      }
    };
  }, []);

  useEffect(() => {
    async function loadStats() {
      setLoadingStats(true);
      setError(null);
      try {
        const response = await fetch("/api/stats");
        if (!response.ok) {
          throw new Error("Stats request failed");
        }
        const payload = (await response.json()) as StatsPayload;
        setStats(payload);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoadingStats(false);
      }
    }

    void loadStats();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void runSearch();
    }, 300);

    async function runSearch() {
      setLoadingSearch(true);
      setError(null);
      try {
        const response = await fetch(`/api/search?${queryString}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Search request failed");
        }
        const payload = (await response.json()) as SearchPayload;
        setSearch(payload);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(String(err));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSearch(false);
        }
      }
    }

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [queryString]);

  async function loadFileDetails(eftaId: string) {
    setLoadingDetail(true);
    setError(null);
    try {
      const response = await fetch(`/api/file/${encodeURIComponent(eftaId)}`);
      if (!response.ok) {
        throw new Error("Detail request failed");
      }
      const payload = (await response.json()) as DetailPayload;
      setSelected(payload);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="glow glow-left" />
      <div className="glow glow-right" />
      <section className="hero">
        <p className="eyebrow">Dashboard</p>
        <h1>Epstein Files: Justice Tracker</h1>
        <p className="subtitle">
          Tracking the status of files released by the DOJ in the Jeffrey
          Epstein case, based on publicly available data and documents.
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

      <GlobalNav
        items={globalNavConfig.items}
        mobileTitle={globalNavConfig.mobileTitle}
        initiallyExpandedGroups={globalNavConfig.initiallyExpandedGroups}
      />

      {error && (
        <section className="panel error-panel">
          <strong>Request Error:</strong> {error}
        </section>
      )}

      <section className="stats-grid">
        <article className="panel stat-card">
          <span>Total Files Tracked</span>
          <strong>
            {loadingStats
              ? "..."
              : formatNumber(stats?.stats.files_without_parent)}
          </strong>
        </article>
        <article className="panel stat-card">
          <span>Altered</span>
          <strong>
            {loadingStats ? "..." : formatNumber(stats?.stats.altered_files)}
          </strong>
        </article>
        <article className="panel stat-card">
          <span>Deleted</span>
          <strong>
            {loadingStats ? "..." : formatNumber(stats?.stats.deleted_files)}
          </strong>
        </article>
        <article className="panel stat-card">
          <span>Distinct Datasets</span>
          <strong>
            {loadingStats
              ? "..."
              : formatNumber(stats?.stats.distinct_datasets)}
          </strong>
        </article>
      </section>

      <section className="panel">
        <div className="filters">
          <label>
            EFTA ID Prefix
            <input
              type="text"
              placeholder="EFTA0242..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>

          <label>
            Dataset
            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
            >
              <option value="">All Datasets</option>
              {(stats?.datasets ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="toggle-group">
            <label className="switch-row" htmlFor="altered-toggle">
              <span>Altered Only</span>
              <input
                id="altered-toggle"
                type="checkbox"
                role="switch"
                checked={alteredOnly}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAlteredOnly(checked);
                  if (checked) {
                    setDeletedOnly(false);
                  }
                }}
              />
            </label>

            <label className="switch-row" htmlFor="deleted-toggle">
              <span>Deleted Only</span>
              <input
                id="deleted-toggle"
                type="checkbox"
                role="switch"
                checked={deletedOnly}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setDeletedOnly(checked);
                  if (checked) {
                    setAlteredOnly(false);
                  }
                }}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="results-layout">
        <article className="panel home-results-panel">
          <header className="results-head home-results-head">
            <h2>Results</h2>
            <p className="home-results-meta-line">
              {loadingSearch
                ? "Loading..."
                : `${formatNumber(search.total)} results`}{" "}
              {"\u2022"} Page {formatNumber(search.page)}
            </p>
          </header>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>EFTA ID</th>
                  <th>Dataset</th>
                  <th>Original File</th>
                  <th>Current DOJ Link</th>
                  <th>Changes</th>
                  <th>Pages</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {search.rows.map((row) => {
                  const originalLink = buildOriginalFileLink(row);
                  const currentDojLink = buildCurrentDojLink(row);
                  const changesLink = buildChangesLink(row);
                  return (
                    <tr
                      key={row.efta_id}
                      onClick={() => void loadFileDetails(row.efta_id)}
                    >
                      <td className="mono">
                        <Link
                          href={`/file/${encodeURIComponent(row.efta_id)}`}
                          className="table-link"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.efta_id}
                        </Link>
                      </td>
                      <td>{row.dataset ?? "-"}</td>
                      <td>
                        {originalLink ? (
                          <a
                            href={originalLink}
                            target="_blank"
                            rel="noreferrer"
                            className="table-link"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Original File
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {currentDojLink ? (
                          <a
                            href={currentDojLink}
                            target="_blank"
                            rel="noreferrer"
                            className="table-link"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Current DOJ Link
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {changesLink ? (
                          <a
                            href={changesLink}
                            target="_blank"
                            rel="noreferrer"
                            className="table-link"
                            onClick={(event) => event.stopPropagation()}
                          >
                            View Changes
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{formatNumber(row.page_count)}</td>
                      <td>
                        <div className="badge-row">
                          {row.altered && (
                            <span className="badge badge-altered">Altered</span>
                          )}
                          {row.deleted && (
                            <span className="badge badge-danger">Deleted</span>
                          )}
                          {row.hidden && (
                            <span className="badge badge-muted">Hidden</span>
                          )}
                          {!row.altered && !row.deleted && !row.hidden && (
                            <span className="badge badge-ok">Original</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!loadingSearch && search.rows.length === 0 && (
              <p className="empty">No rows matched this query.</p>
            )}
          </div>

          <div className="mobile-result-list">
            {search.rows.map((row) => {
              const originalLink = buildOriginalFileLink(row);
              const currentDojLink = buildCurrentDojLink(row);
              const changesLink = buildChangesLink(row);
              const statusLabel = row.deleted
                ? "Deleted"
                : row.altered
                  ? "Altered"
                  : row.hidden
                    ? "Hidden"
                    : "Active";
              const statusClassName = row.deleted
                ? "badge-danger"
                : row.altered
                  ? "badge-altered"
                  : row.hidden
                    ? "badge-muted"
                    : "badge-ok";
              return (
                <article
                  key={`${row.efta_id}-mobile`}
                  className="mobile-result-card home-mobile-card"
                  onClick={() => void loadFileDetails(row.efta_id)}
                >
                  <div className="home-mobile-line1">
                    <Link
                      href={`/file/${encodeURIComponent(row.efta_id)}`}
                      className="table-link mobile-result-title home-mobile-id"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.efta_id}
                    </Link>
                    <span
                      className={`badge home-mobile-status ${statusClassName}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="mobile-result-line home-mobile-meta">
                    Dataset {row.dataset ?? "-"}{" "}
                    <span style={{ paddingInline: 4 }}>•</span>{" "}
                    {formatPageLabel(row.page_count)}
                  </p>
                  <div className="home-mobile-line3">
                    {originalLink ? (
                      <a
                        href={originalLink}
                        target="_blank"
                        rel="noreferrer"
                        className="home-mobile-action-btn"
                        aria-label={`Open Archive for ${row.efta_id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Archive <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span className="home-mobile-action-btn is-disabled">
                        Archive
                      </span>
                    )}
                    {currentDojLink ? (
                      <a
                        href={currentDojLink}
                        target="_blank"
                        rel="noreferrer"
                        className="home-mobile-action-btn"
                        aria-label={`Open DOJ link for ${row.efta_id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        DOJ <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span className="home-mobile-action-btn is-disabled">
                        DOJ
                      </span>
                    )}
                    {changesLink ? (
                      <a
                        href={changesLink}
                        target="_blank"
                        rel="noreferrer"
                        className="home-mobile-action-btn"
                        aria-label={`View changes for ${row.efta_id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Changes <span aria-hidden="true">↗</span>
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {!loadingSearch && search.rows.length === 0 && (
              <p className="empty">No rows matched this query.</p>
            )}
          </div>

          <div className="pagination">
            <button
              disabled={search.page <= 1 || loadingSearch}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              disabled={search.page >= search.totalPages || loadingSearch}
              onClick={() => setPage((p) => Math.min(search.totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </article>

        <aside className="panel details">
          <header className="results-head">
            <h2>Details</h2>
            <p>
              {loadingDetail
                ? "Loading record..."
                : selected
                  ? selected.file.efta_id
                  : "Select a row"}
            </p>
          </header>

          {!selected && !loadingDetail && (
            <p className="empty">
              Click any result row to inspect the full record.
            </p>
          )}

          {selected && (
            <div className="detail-list">
              <p>
                <strong>EFTA:</strong>{" "}
                <span className="mono">{selected.file.efta_id}</span>
              </p>
              <p>
                <strong>Parent:</strong>{" "}
                <span className="mono">
                  {selected.file.parent_efta_id ?? "None"}
                </span>
              </p>
              <p>
                <strong>Dataset:</strong> {selected.file.dataset ?? "-"}
              </p>
              <p>
                <strong>File Path:</strong>{" "}
                <span className="mono">{selected.file.file_path ?? "-"}</span>
              </p>
              <p>
                <strong>Page Count:</strong>{" "}
                {formatNumber(selected.file.page_count)}
              </p>
              <p>
                <strong>Altered:</strong> {selected.file.altered ? "Yes" : "No"}
              </p>
              <p>
                <strong>Hidden:</strong> {selected.file.hidden ? "Yes" : "No"}
              </p>
              <p>
                <strong>Deleted:</strong> {selected.file.deleted ? "Yes" : "No"}
              </p>
              <p>
                <strong>DOJ Page:</strong>{" "}
                {formatNumber(selected.file.doj_website_page)}
              </p>
              <p>
                <strong>Last Checked:</strong>{" "}
                {asDate(selected.file.last_checked)}
              </p>
              <p>
                <strong>Children:</strong>{" "}
                {formatNumber(selected.children.length)}
              </p>
              {selected.parent && (
                <p>
                  <strong>Parent Exists:</strong>{" "}
                  <span className="mono">{selected.parent.efta_id}</span>
                </p>
              )}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
