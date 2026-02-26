import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Top Deleted Doc Upvotes",
  description:
    "See the most upvoted deleted document records with preview access and ranking history.",
  alternates: {
    canonical: "/deleted-docs-top-upvoted",
  },
  openGraph: {
    title: "Top Deleted Doc Upvotes",
    description:
      "Community-ranked deleted documents from the Epstein Files browser.",
    type: "website",
    url: "/deleted-docs-top-upvoted",
  },
};

export default function DeletedDocsTopUpvotedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
