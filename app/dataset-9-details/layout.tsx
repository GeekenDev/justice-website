import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Dataset 9 Details",
  description:
    "Detailed notes, disclaimers, missing files, and reconstruction context for DOJ Epstein Dataset 9.",
  alternates: {
    canonical: "/dataset-9-details",
  },
  openGraph: {
    title: "Dataset 9 Details",
    description:
      "Deep-dive details and reconstruction notes for Epstein Files Dataset 9.",
    type: "website",
    url: "/dataset-9-details",
  },
};

export default function Dataset9DetailsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
