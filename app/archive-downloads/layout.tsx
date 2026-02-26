import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Archive Downloads",
  description:
    "Download mirror archives for DOJ Epstein datasets 1 through 12 with file size and release range details.",
  alternates: {
    canonical: "/archive-downloads",
  },
  openGraph: {
    title: "Archive Downloads",
    description:
      "Mirror archive download links for Epstein Files datasets 1-12.",
    type: "website",
    url: "/archive-downloads",
  },
};

export default function ArchiveDownloadsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
