import type { Metadata } from "next";
import { cache } from "react";
import DeletedDocsBrowserClient from "./deleted-docs-browser-client";
import { getDeletedFileById } from "@/lib/db";
import { absoluteUrl } from "@/lib/seo";
import { withSources } from "@/lib/sources";

type DeletedDocsBrowserPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getDeletedRecord = cache(async (eftaId: string) => {
  const record = await getDeletedFileById(eftaId);
  return record ? withSources(record) : null;
});

function normalizeEftaId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().toUpperCase();
}

export async function generateMetadata({
  searchParams,
}: DeletedDocsBrowserPageProps): Promise<Metadata> {
  const params = await searchParams;
  const requestedId = normalizeEftaId(params.id);

  if (!requestedId) {
    const canonicalPath = "/deleted-docs-browser";
    const description =
      "Browse deleted Epstein file documents with previews, voting, bookmarks, and reporting tools.";

    return {
      title: "Deleted Docs Browser",
      description,
      alternates: {
        canonical: canonicalPath,
      },
      openGraph: {
        type: "website",
        url: absoluteUrl(canonicalPath),
        title: "Deleted Docs Browser",
        description,
      },
      twitter: {
        card: "summary",
        title: "Deleted Docs Browser",
        description,
      },
    };
  }

  const record = await getDeletedRecord(requestedId);
  if (!record) {
    return {
      title: `Deleted File ${requestedId} Not Found`,
      description: `No deleted DOJ file record found for ${requestedId}.`,
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const datasetLabel = record.dataset
    ? `Dataset ${record.dataset}`
    : "Unknown dataset";
  const canonicalPath = `/deleted-docs-browser?id=${encodeURIComponent(record.efta_id)}`;
  const canonicalUrl = absoluteUrl(canonicalPath);
  const oembedUrl = absoluteUrl(
    `/api/oembed/deleted-docs-browser?url=${encodeURIComponent(canonicalUrl)}`,
  );
  const oembedXmlUrl = absoluteUrl(
    `/api/oembed/deleted-docs-browser?url=${encodeURIComponent(canonicalUrl)}&format=xml`,
  );
  const description = `Preview deleted DOJ file ${record.efta_id} (${datasetLabel}) from the Deleted Docs Browser.`;

  return {
    title: `Deleted File ${record.efta_id} (${datasetLabel})`,
    description,
    alternates: {
      canonical: canonicalPath,
      types: {
        "application/json+oembed": oembedUrl,
        "text/xml+oembed": oembedXmlUrl,
      },
    },
    openGraph: {
      type: "article",
      url: canonicalUrl,
      title: `Deleted File ${record.efta_id}`,
      description,
    },
    twitter: {
      card: "summary",
      title: `Deleted File ${record.efta_id}`,
      description,
    },
    other: {
      "deleted-doc-id": record.efta_id,
      "deleted-doc-dataset": record.dataset ?? "",
      "deleted-doc-original-url": record.sources.original_link ?? "",
      "deleted-doc-doj-url": record.sources.doj_link ?? "",
    },
  };
}

export default function DeletedDocsBrowserPage() {
  return <DeletedDocsBrowserClient />;
}
