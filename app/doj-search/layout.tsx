import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "DOJ Search",
  description:
    "Search DOJ Epstein file records, preview documents, and view community upvotes.",
  alternates: {
    canonical: "/doj-search",
  },
  openGraph: {
    title: "DOJ Search",
    description:
      "Search DOJ Epstein file records with previews and upvote signals.",
    type: "website",
    url: "/doj-search",
  },
};

export default function DOJSearchLayout({ children }: { children: ReactNode }) {
  return children;
}
