import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "My Deleted Doc Upvotes",
  description:
    "Review the deleted documents you have upvoted, with original source links and PDF preview.",
  alternates: {
    canonical: "/deleted-docs-my-upvotes",
  },
  openGraph: {
    title: "My Deleted Doc Upvotes",
    description:
      "Your upvoted deleted documents in the Epstein Files browser.",
    type: "website",
    url: "/deleted-docs-my-upvotes",
  },
};

export default function DeletedDocsMyUpvotesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
