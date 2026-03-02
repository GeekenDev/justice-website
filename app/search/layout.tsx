import type { Metadata } from "next";
import type { ReactNode } from "react";
import { absoluteUrl } from "@/lib/seo";

const SEARCH_PATH = "/search";
const SEARCH_TITLE = "Search";
const SEARCH_DESCRIPTION =
  "Advanced search for Epstein files with syntax filters, phrase matching, exclusions, and fast PDF previews. Search the latest Department of Justice Epstein files with our powerful search engine. Use Google-like syntax for precise results, including phrase matching and exclusions. Get instant PDF previews without leaving the page. Explore the latest documents and uncover insights with ease.";

export const metadata: Metadata = {
  title: SEARCH_TITLE,
  description: SEARCH_DESCRIPTION,
  alternates: {
    canonical: SEARCH_PATH,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: SEARCH_TITLE,
    description: SEARCH_DESCRIPTION,
    type: "website",
    url: absoluteUrl(SEARCH_PATH),
  },
  twitter: {
    card: "summary",
    title: SEARCH_TITLE,
    description: SEARCH_DESCRIPTION,
  },
};

export default function SearchLayout({ children }: { children: ReactNode }) {
  return children;
}
