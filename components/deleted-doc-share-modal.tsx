"use client";

import { useMemo, useState } from "react";

type DeletedDocShareModalProps = {
  isOpen: boolean;
  eftaId: string | null;
  datasetLabel?: string | null;
  sharePath?: string;
  onClose: () => void;
  onCopyError?: (message: string) => void;
};

export default function DeletedDocShareModal({
  isOpen,
  eftaId,
  datasetLabel,
  sharePath = "/deleted-docs-browser",
  onClose,
  onCopyError,
}: DeletedDocShareModalProps) {
  const [copied, setCopied] = useState(false);

  const shareBaseUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
    }
    const hostname = window.location.hostname.toLowerCase();
    const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
    const fallbackOrigin =
      hostname === "localhost" || hostname === "127.0.0.1"
        ? "https://justice.geeken.dev"
        : window.location.origin;
    return (configured || fallbackOrigin).replace(/\/+$/, "");
  }, []);

  const shareUrl = useMemo(() => {
    if (!eftaId || !shareBaseUrl) {
      return "";
    }
    const url = new URL(`${shareBaseUrl}${sharePath}`);
    url.searchParams.set("id", eftaId);
    return url.toString();
  }, [eftaId, shareBaseUrl, sharePath]);

  const shareText = useMemo(() => {
    if (!eftaId) {
      return "Deleted DOJ file";
    }
    return `Deleted DOJ file ${eftaId}${datasetLabel ? ` (${datasetLabel})` : ""}`;
  }, [datasetLabel, eftaId]);

  const redditShareUrl = useMemo(
    () =>
      shareUrl
        ? `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`
        : "",
    [shareText, shareUrl],
  );
  const facebookShareUrl = useMemo(
    () => (shareUrl ? `https://www.facebook.com/sharer.php?u=${encodeURIComponent(shareUrl)}` : ""),
    [shareUrl],
  );
  const xShareUrl = useMemo(
    () =>
      shareUrl
        ? `https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
        : "",
    [shareText, shareUrl],
  );
  const linkedInShareUrl = useMemo(
    () =>
      shareUrl
        ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
        : "",
    [shareUrl],
  );

  async function onCopyShareLink() {
    if (!shareUrl) {
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      onCopyError?.("Could not copy share link.");
    }
  }

  if (!isOpen || !eftaId) {
    return null;
  }

  return (
    <div className="pdf-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="panel share-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share deleted document"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="share-modal-head">
          <h2>Share {eftaId}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="share-modal-body">
          <a href={redditShareUrl} target="_blank" rel="noreferrer" className="share-action-link">
            Share to Reddit
          </a>
          <a href={facebookShareUrl} target="_blank" rel="noreferrer" className="share-action-link">
            Share to Facebook
          </a>
          <a href={xShareUrl} target="_blank" rel="noreferrer" className="share-action-link">
            Share to X
          </a>
          <a href={linkedInShareUrl} target="_blank" rel="noreferrer" className="share-action-link">
            Share to LinkedIn
          </a>
          <button type="button" onClick={() => void onCopyShareLink()}>
            {copied ? "Copied" : "Copy Link"}
          </button>
        </div>
      </section>
    </div>
  );
}
