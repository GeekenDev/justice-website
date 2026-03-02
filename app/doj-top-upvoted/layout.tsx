import { absoluteUrl } from "@/lib/seo";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const TOP_SEARCHES_PATH = "/doj-top-upvoted";
const TOP_SEARCHES_TITLE = "Top Searches";
const TOP_SEARCHES_DESCRIPTION =
  "Browse the top upvoted search results and trending queries for the Epstein files dataset.";

export const metadata: Metadata = {
  title: TOP_SEARCHES_TITLE,
  description: TOP_SEARCHES_DESCRIPTION,
  alternates: {
    canonical: TOP_SEARCHES_PATH,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: TOP_SEARCHES_TITLE,
    description: TOP_SEARCHES_DESCRIPTION,
    type: "website",
    url: absoluteUrl(TOP_SEARCHES_PATH),
  },
  twitter: {
    card: "summary",
    title: TOP_SEARCHES_TITLE,
    description: TOP_SEARCHES_DESCRIPTION,
  },
};

export default function DOJTopUpvotedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
