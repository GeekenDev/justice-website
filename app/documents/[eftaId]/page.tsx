import type { Metadata } from "next";
import DocumentViewerClient from "./document-viewer-client";
import { absoluteUrl } from "@/lib/seo";

type DocumentViewerPageProps = {
  params: Promise<{
    eftaId: string;
  }>;
};

export default async function DocumentViewerPage({ params }: DocumentViewerPageProps) {
  const { eftaId } = await params;
  const normalized = eftaId.trim().toUpperCase();
  return <DocumentViewerClient eftaId={normalized} />;
}

export async function generateMetadata({
  params,
}: DocumentViewerPageProps): Promise<Metadata> {
  const { eftaId } = await params;
  const normalized = eftaId.trim().toUpperCase();
  const canonicalPath = `/documents/${encodeURIComponent(normalized)}`;
  const description = `Viewer for DOJ file ${normalized}.`;

  return {
    title: `Document ${normalized}`,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "article",
      url: absoluteUrl(canonicalPath),
      title: `Document ${normalized}`,
      description,
    },
    twitter: {
      card: "summary",
      title: `Document ${normalized}`,
      description,
    },
  };
}
