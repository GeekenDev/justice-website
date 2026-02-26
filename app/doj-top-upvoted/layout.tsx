import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Top DOJ Upvoted Results",
  description:
    "Browse the most upvoted DOJ search results with document preview and community ranking.",
  alternates: {
    canonical: "/doj-top-upvoted",
  },
  openGraph: {
    title: "Top DOJ Upvoted Results",
    description:
      "Community-ranked DOJ search results for Epstein Files.",
    type: "website",
    url: "/doj-top-upvoted",
  },
};

export default function DOJTopUpvotedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
