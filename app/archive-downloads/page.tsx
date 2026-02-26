import type { Metadata } from "next";
import Link from "next/link";

const datasets = [
  {
    label: "Dataset 1",
    zipSize: "1.23 GB",
    fileRange: "00000001-00003158",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%201.zip",
  },
  {
    label: "Dataset 2",
    zipSize: "630 MB",
    fileRange: "00003159-00003857",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%202.zip",
  },
  {
    label: "Dataset 3",
    zipSize: "595 MB",
    fileRange: "00003858-00005704",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%203.zip",
  },
  {
    label: "Dataset 4",
    zipSize: "351 MB",
    fileRange: "00005705-00008408",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%204.zip",
  },
  {
    label: "Dataset 5",
    zipSize: "61.4 MB",
    fileRange: "00008409-00008528",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%205.zip",
  },
  {
    label: "Dataset 6",
    zipSize: "51.2 MB",
    fileRange: "00008529-00009015",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%206.zip",
  },
  {
    label: "Dataset 7",
    zipSize: "96.9 MB",
    fileRange: "00009016-00009675",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%207.zip",
  },
  {
    label: "Dataset 8",
    zipSize: "10.67 GB",
    fileRange: "00009676-00039024",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%208.zip",
  },
  {
    label: "Dataset 9*",
    zipSize: "180 GB (incomplete)",
    fileRange: "00039025-01262781",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%209.zip",
  },
  {
    label: "Dataset 10",
    zipSize: "78.65 GB",
    fileRange: "01262782-02212882",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%2010.zip",
  },
  {
    label: "Dataset 11",
    zipSize: "27.5 GB",
    fileRange: "02212883-02730264",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%2011.zip",
  },
  {
    label: "Dataset 12",
    zipSize: "114.1 MB",
    fileRange: "02730265-02731860",
    url: "https://doj-files.geeken.dev/doj_zips/original_archives/DataSet%2012.zip",
  },
];

export const metadata: Metadata = {
  title: "Archive Downloads",
  description: "Download mirrored archive zip files by dataset.",
  alternates: {
    canonical: "/archive-downloads",
  },
};

export default function ArchiveDownloadsPage() {
  return (
    <main className="app-shell">
      <div className="glow glow-left" />
      <div className="glow glow-right" />
      <section className="hero">
        <p className="eyebrow">Archives</p>
        <h1>Archive Downloads</h1>
        <p className="subtitle">Mirror links for dataset zip archives.</p>
      </section>

      <section className="panel detail-nav">
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
      </section>

      <section className="panel">
        <header className="results-head">
          <h2>Datasets</h2>
          <p>{datasets.length} archives</p>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dataset Number</th>
                <th>Zip Size</th>
                <th>EFTA # File Range</th>
                <th>Mirror Link</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((dataset) => {
                const isDataset9 = dataset.label === "Dataset 9*";
                return (
                  <tr key={dataset.label}>
                    <td>
                      {isDataset9 ? (
                        <Link href="/dataset-9-details" className="table-link">
                          {dataset.label}
                        </Link>
                      ) : (
                        dataset.label
                      )}
                    </td>
                    <td>
                      {isDataset9 ? (
                        <>
                          180 GB (
                          <Link
                            href="/dataset-9-details"
                            className="table-link"
                          >
                            incomplete
                          </Link>
                          )
                        </>
                      ) : (
                        dataset.zipSize
                      )}
                    </td>
                    <td className="mono">{dataset.fileRange}</td>
                    <td>
                      <a
                        href={dataset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="table-link"
                      >
                        {dataset.url}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="empty">
        Technical Document Tracking - GitHub Repo:{" "}
        <a
          href="https://github.com/yung-megafone/Epstein-Files"
          target="_blank"
          rel="noreferrer"
          className="table-link"
        >
          yung-megafone/Epstein-Files
        </a>
        .
      </p>

      <section className="panel detail-list">
        <p>
          <strong>* Dataset 9 (community reconstructed)</strong>
        </p>
        <p>
          Data Set 9 has historically been the largest, most unstable, and most
          complex of the Epstein Files releases.
        </p>
        <p>Unlike other datasets, DS09:</p>
        <ul>
          <li>was distributed via an incomplete and unreliable ZIP</li>
          <li>circulated in multiple partial community reconstructions</li>
          <li>required reconciliation using metadata (.DAT / .OPT) files</li>
          <li>
            included both PDFs and a large number of NATIVEs (media files)
          </li>
          <li>was the largest EFTA release to date</li>
        </ul>
        <p>
          <a
            href="https://github.com/yung-megafone/Epstein-Files/blob/main/notes/DS09/README.md"
            target="_blank"
            rel="noreferrer"
            className="table-link"
          >
            This document
          </a>{" "}
          exists to preserve context, evolution, and verification paths without
          overloading the main index.
        </p>
      </section>
    </main>
  );
}
