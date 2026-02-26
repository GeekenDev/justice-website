import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Overview",
  description: "Overview of DOJ Epstein Files datasets 1-12.",
  alternates: {
    canonical: "/overview",
  },
};

export default function OverviewPage() {
  return (
    <main className="app-shell">
      <div className="glow glow-left" />
      <div className="glow glow-right" />
      <section className="hero">
        <p className="eyebrow">Overview</p>
        <h1>DOJ Epstein Files Datasets</h1>
        <p className="subtitle">Context for Datasets 1 through 12.</p>
      </section>

      <section className="panel detail-nav link-bar">
        <Link href="/" className="table-link">
          Back to Dashboard
        </Link>
        <Link href="/archive-downloads" className="table-link">
          Archive Downloads
        </Link>
      </section>

      <section className="panel detail-list">
        <p>
          The DOJ Epstein Files (Datasets 1-12) represent a collection of
          independently released document batches originating from U.S.
          Department of Justice disclosures and related judicial proceedings.
          These datasets are not a single unified archive but rather a sequence
          of compressed releases published at different times, each containing
          heterogeneous evidentiary materials such as PDFs, scanned records,
          native digital files, exhibits, and associated metadata. File sizes
          vary significantly across batches, and some releases were distributed
          in multi-part archives. Due to the fragmented publication process,
          third-party mirrors and integrity verification methods (including
          cryptographic hashes and torrent distribution) have been used to
          ensure dataset completeness and reproducibility. The numbering (1-12)
          reflects release order rather than chronological organization or
          investigative structure.
        </p>
        <p>
          From a data interpretation standpoint, the contents span multiple
          evidentiary domains, including investigative documentation,
          communications, financial records, travel logs, and court-submitted
          materials, with redactions applied to comply with privacy protections,
          victim-identification safeguards, and legal disclosure constraints.
          The presence of names or entities within the datasets reflects their
          appearance in source records and does not imply wrongdoing or legal
          liability. Researchers should treat the corpus as a partially redacted
          evidentiary collection with variable provenance granularity across
          files. As with many large-scale legal document releases, gaps may
          exist due to withheld material, ongoing legal restrictions, or
          incomplete public distribution, and future releases or corrections may
          modify the available corpus.
        </p>
      </section>
    </main>
  );
}
