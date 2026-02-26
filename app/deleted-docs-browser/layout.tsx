import type { Metadata } from "next";
import type { Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Deleted Docs Browser",
  description:
    "Browse deleted Epstein file documents, report sensitive records, and view community voting trends.",
  alternates: {
    canonical: "/deleted-docs-browser",
  },
  openGraph: {
    title: "Deleted Docs Browser",
    description:
      "Browse random deleted Epstein file records with preview and community voting.",
    type: "website",
    url: "/deleted-docs-browser",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function DeletedDocsBrowserLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
