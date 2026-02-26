import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Read the overview and context for DOJ Epstein datasets, release structure, and interpretation notes.",
  alternates: {
    canonical: "/overview",
  },
  openGraph: {
    title: "Overview",
    description:
      "Context and interpretation guidance for Epstein Files datasets and releases.",
    type: "website",
    url: "/overview",
  },
};

export default function OverviewLayout({ children }: { children: ReactNode }) {
  return children;
}
