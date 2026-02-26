"use client";

import { useEffect, useMemo, useState } from "react";

type ShareButtonProps = {
  url: string;
  title: string;
  text?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  onCopied?: (url: string) => void;
  onError?: (message: string) => void;
};

export default function ShareButton({
  url,
  title,
  text,
  className,
  disabled = false,
  label = "Share",
  onCopied,
  onError,
}: ShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "shared">("idle");

  useEffect(() => {
    if (status === "idle") {
      return;
    }
    const timeout = window.setTimeout(() => setStatus("idle"), 1400);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const buttonText = useMemo(() => {
    if (status === "shared") {
      return "Shared";
    }
    if (status === "copied") {
      return "Copied";
    }
    return label;
  }, [label, status]);

  async function onShare() {
    if (!url) {
      return;
    }
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title,
          text,
          url,
        });
        setStatus("shared");
        onCopied?.(url);
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
        onCopied?.(url);
      }
    } catch (error) {
      const err = error as { name?: string } | undefined;
      if (err?.name === "AbortError") {
        return;
      }
      if (typeof window !== "undefined") {
        window.prompt("Copy this link:", url);
      }
      onError?.(String(error));
    }
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={() => void onShare()}>
      {buttonText}
    </button>
  );
}
