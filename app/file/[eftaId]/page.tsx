import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getFileById } from "@/lib/db";
import { absoluteUrl } from "@/lib/seo";

type FilePageProps = {
  params: Promise<{
    eftaId: string;
  }>;
};

const getFileRecord = cache(async (eftaId: string) => getFileById(eftaId));

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

function buildOriginalFileLink(file: {
  dataset: string | null;
  file_path: string | null;
}) {
  if (!file.dataset || !file.file_path) {
    return null;
  }
  const datasetNumber = Number(file.dataset);
  if (Number.isNaN(datasetNumber)) {
    return null;
  }
  const volume = `VOL${String(datasetNumber).padStart(5, "0")}`;
  let normalizedPath = file.file_path.replace(/^\/+/, "");

  if (datasetNumber === 9) {
    const parts = normalizedPath.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1];
    if (fileName) {
      normalizedPath = `IMAGES/${fileName}`;
    }
  }

  return `https://doj-files.geeken.dev/doj_zips/${volume}/${normalizedPath}`;
}

function buildCurrentDojLink(file: {
  dataset: string | null;
  efta_id: string;
}) {
  if (!file.dataset) {
    return null;
  }
  const datasetNumber = Number(file.dataset);
  if (Number.isNaN(datasetNumber)) {
    return null;
  }
  return `https://www.justice.gov/epstein/files/DataSet%20${datasetNumber}/${file.efta_id}.pdf`;
}

export default async function FileDetailsPage({ params }: FilePageProps) {
  const { eftaId } = await params;
  const record = await getFileRecord(eftaId);
  if (!record) {
    notFound();
  }

  const originalLink = buildOriginalFileLink(record.file);
  const currentDojLink = buildCurrentDojLink(record.file);
  const statusLabel = record.file.deleted
    ? "Deleted"
    : record.file.altered
      ? "Altered"
      : record.file.hidden
        ? "Hidden"
        : "Active";
  const statusClassName = record.file.deleted
    ? "badge-danger"
    : record.file.altered
      ? "badge-accent"
      : record.file.hidden
        ? "badge-muted"
        : "badge-ok";

  return (
    <main className="app-shell detail-page file-detail-page">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="hero">
        <p className="eyebrow">File Details</p>
        <h1 className="mono">Epstein Files - {record.file.efta_id}</h1>
        <p className="subtitle">
          Full metadata and relationships for this record.
        </p>
        <div className="badge-row file-detail-summary-row">
          <span className={`badge ${statusClassName}`}>{statusLabel}</span>
          <span className="badge badge-muted">
            Dataset {record.file.dataset ?? "-"}
          </span>
          <span className="badge badge-accent">
            Pages {formatNumber(record.file.page_count)}
          </span>
        </div>
      </section>

      <section className="panel detail-nav">
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
      </section>

      <section className="detail-grid">
        <article className="panel file-metadata-panel">
          <header className="results-head">
            <h2>Metadata</h2>
          </header>
          <div className="detail-list">
            <p>
              <strong>EFTA ID:</strong>{" "}
              <span className="mono">{record.file.efta_id}</span>
            </p>
            <p>
              <strong>Parent EFTA ID:</strong>{" "}
              <span className="mono">
                {record.file.parent_efta_id ?? "None"}
              </span>
            </p>
            <p>
              <strong>Dataset:</strong> {record.file.dataset ?? "-"}
            </p>
            <p>
              <strong>File Path:</strong>{" "}
              <span className="mono">{record.file.file_path ?? "-"}</span>
            </p>
            <p>
              <strong>Pages:</strong> {formatNumber(record.file.page_count)}
            </p>
            <p>
              <strong>Altered:</strong>{" "}
              {record.file.altered ? "Yes" : "No"}
            </p>
            <p>
              <strong>Hidden:</strong> {record.file.hidden ? "Yes" : "No"}
            </p>
            <p>
              <strong>Deleted:</strong>{" "}
              {record.file.deleted ? "Yes" : "No"}
            </p>
            <p>
              <strong>Shows In Search:</strong>{" "}
              {record.file.shows_in_search === true
                ? "Yes"
                : record.file.shows_in_search === false
                  ? "No"
                  : "-"}
            </p>
            <p>
              <strong>DOJ Website Page:</strong>{" "}
              {formatNumber(record.file.doj_website_page)}
            </p>
            <p>
              <strong>Last Checked:</strong> {asDate(record.file.last_checked)}
            </p>
            <p>
              <strong>Original Hash:</strong>{" "}
              <span className="mono">{record.file.original_hash ?? "-"}</span>
            </p>
            <p>
              <strong>Current Hash:</strong>{" "}
              <span className="mono">{record.file.current_hash ?? "-"}</span>
            </p>
            <p>
              <strong>Notes:</strong> {record.file.notes ?? "-"}
            </p>
            <p>
              <strong>Original File:</strong>{" "}
              {originalLink ? (
                <a
                  href={originalLink}
                  target="_blank"
                  rel="noreferrer"
                  className="table-link"
                >
                  Open original
                </a>
              ) : (
                "-"
              )}
            </p>
            <p>
              <strong>Current DOJ Link:</strong>{" "}
              {currentDojLink ? (
                <a
                  href={currentDojLink}
                  target="_blank"
                  rel="noreferrer"
                  className="table-link"
                >
                  Open DOJ file
                </a>
              ) : (
                "-"
              )}
            </p>
          </div>
        </article>

        <article className="panel file-relationships-panel">
          <header className="results-head">
            <h2>Relationships</h2>
          </header>
          <div className="detail-list">
            <p>
              <strong>Parent Record:</strong>{" "}
              {record.parent ? (
                <Link
                  href={`/file/${encodeURIComponent(record.parent.efta_id)}`}
                  className="table-link mono"
                >
                  {record.parent.efta_id}
                </Link>
              ) : (
                "None"
              )}
            </p>
            <p>
              <strong>Children:</strong> {formatNumber(record.children.length)}
            </p>
            {record.children.length > 0 && (
              <div className="children-list">
                {record.children.map((child) => (
                  <Link
                    key={child.efta_id}
                    href={`/file/${encodeURIComponent(child.efta_id)}`}
                    className="table-link mono"
                  >
                    {child.efta_id}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

export async function generateMetadata({
  params
}: FilePageProps): Promise<Metadata> {
  const { eftaId } = await params;
  const record = await getFileRecord(eftaId);

  if (!record) {
    return {
      title: "File Not Found",
      robots: {
        index: false,
        follow: false
      }
    };
  }

  const canonicalPath = `/file/${encodeURIComponent(record.file.efta_id)}`;
  const description = `Metadata for ${record.file.efta_id} in dataset ${
    record.file.dataset ?? "unknown"
  }, including status, relationships, and source links.`;

  return {
    title: `File ${record.file.efta_id}`,
    description,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      type: "article",
      url: absoluteUrl(canonicalPath),
      title: `File ${record.file.efta_id}`,
      description
    },
    twitter: {
      card: "summary",
      title: `File ${record.file.efta_id}`,
      description
    }
  };
}
