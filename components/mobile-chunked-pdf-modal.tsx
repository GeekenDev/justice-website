"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import ShareButton from "@/components/share-button";

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy?: () => void;
};

type PdfJsPage = {
  getViewport: (options: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel?: () => void };
};

type MobileChunkedPdfModalProps = {
  sourceUrl: string;
  title: string;
  kicker: string;
  eftaId?: string;
  voteUrl?: string;
  voteTitle?: string;
  voteFileName?: string;
  voteSnippet?: string;
  onClose: () => void;
};

const MAX_ZOOM = 3.5;
const MAX_RENDER_ZOOM = 2;
const MOMENTUM_BOOST = 18;
const MIN_FLING_DISTANCE_PX = 22;
const MIN_FLING_SPEED = 0.14;
const MAX_FLING_SAMPLE_AGE_MS = 70;
const RENDER_CHUNK_SIZE = 12;
const CHUNK_PRELOAD_MARGIN_PX = 1200;
const VOTER_ID_KEY = "deleted_doc_voter_id";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function withPdfZoom(url: string) {
  return `${url}${url.includes("#") ? "&" : "#"}page=1&view=FitH&zoom=page-width&scrollbar=1&pagemode=none`;
}

export default function MobileChunkedPdfModal({
  sourceUrl,
  title,
  kicker,
  eftaId = "",
  voteUrl = "",
  voteTitle,
  voteFileName,
  voteSnippet,
  onClose,
}: MobileChunkedPdfModalProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const pinchAnchorRef = useRef<{
    localX: number;
    localY: number;
    centerOffsetX: number;
    centerOffsetY: number;
  } | null>(null);
  const isPinchingRef = useRef(false);
  const renderZoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panStartRef = useRef<{
    touchX: number;
    touchY: number;
    scrollLeft: number;
    scrollTop: number;
    lastTouchX: number;
    lastTouchY: number;
    lastTs: number;
    vx: number;
    vy: number;
  } | null>(null);
  const momentumFrameRef = useRef<number | null>(null);

  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPageLimit, setRenderedPageLimit] = useState(0);
  const [basePageWidth, setBasePageWidth] = useState(960);
  const [zoom, setZoom] = useState(1);
  const [renderZoom, setRenderZoom] = useState(1);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [voterId, setVoterId] = useState("");
  const [upvoteCount, setUpvoteCount] = useState(0);
  const [userVoted, setUserVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [canUpvote, setCanUpvote] = useState(false);
  const pageWidth = Math.max(280, Math.floor(basePageWidth));
  const normalizedEftaId = eftaId.trim().toUpperCase();
  const normalizedVoteUrl = voteUrl.trim();
  const shareUrl = useMemo(() => {
    if (!normalizedEftaId || typeof window === "undefined") {
      return sourceUrl;
    }
    return `${window.location.origin}/documents/${encodeURIComponent(normalizedEftaId)}`;
  }, [normalizedEftaId, sourceUrl]);
  const shareTitle = normalizedEftaId || title || "PDF Viewer";
  const shareText = normalizedEftaId
    ? `Document ${normalizedEftaId}`
    : "PDF document";

  const syncVisualZoom = (nextZoom: number) => {
    const node = transformRef.current;
    if (!node) {
      return;
    }
    node.style.zoom = String(nextZoom);
  };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 961px)");
    const apply = () => setIsDesktopViewport(media.matches);
    apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  useEffect(() => {
    let id = "";
    try {
      id = window.localStorage.getItem(VOTER_ID_KEY) ?? "";
      if (!id) {
        id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(VOTER_ID_KEY, id);
      }
    } catch {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    setVoterId(id);
  }, []);

  useEffect(() => {
    if (!normalizedVoteUrl || !voterId) {
      setCanUpvote(false);
      setUpvoteCount(0);
      setUserVoted(false);
      return;
    }
    let cancelled = false;
    async function loadVoteState() {
      try {
        const response = await fetch(
          `/api/doj-search/votes?url=${encodeURIComponent(normalizedVoteUrl)}`,
          {
            headers: { "x-voter-id": voterId },
          },
        );
        if (!response.ok) {
          if (!cancelled) {
            setCanUpvote(false);
            setUpvoteCount(0);
            setUserVoted(false);
          }
          return;
        }
        const payload = (await response.json()) as {
          voteCount?: number;
          userVoted?: boolean;
        };
        if (cancelled) {
          return;
        }
        setCanUpvote(true);
        setUpvoteCount(typeof payload.voteCount === "number" ? payload.voteCount : 0);
        setUserVoted(Boolean(payload.userVoted));
      } catch {
        if (!cancelled) {
          setCanUpvote(false);
          setUpvoteCount(0);
          setUserVoted(false);
        }
      }
    }
    void loadVoteState();
    return () => {
      cancelled = true;
    };
  }, [normalizedVoteUrl, voterId]);

  async function onUpvoteDoc() {
    if (!canUpvote || !normalizedVoteUrl || !voterId || userVoted || isVoting) {
      return;
    }
    setIsVoting(true);
    try {
      const resolvedTitle =
        voteTitle ?? (normalizedEftaId || title || "Search Result");
      const response = await fetch("/api/doj-search/upvote", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-voter-id": voterId,
        },
        body: JSON.stringify({
          url: normalizedVoteUrl,
          title: resolvedTitle,
          fileName: voteFileName ?? null,
          snippet: voteSnippet ?? null,
        }),
      });
      const payload = (await response.json()) as {
        voteCount?: number;
        alreadyVoted?: boolean;
      };
      if (!response.ok) {
        return;
      }
      setUpvoteCount(
        typeof payload.voteCount === "number" ? payload.voteCount : upvoteCount + 1,
      );
      setUserVoted(Boolean(payload.alreadyVoted) || true);
    } finally {
      setIsVoting(false);
    }
  }

  useEffect(() => {
    setPdfDoc(null);
    setPageCount(0);
    setRenderedPageLimit(0);
    setFatalError(null);
    setIsPdfLoading(true);
    setZoom(1);
    setRenderZoom(1);
    canvasRefs.current.clear();
    zoomRef.current = 1;
    syncVisualZoom(1);
  }, [sourceUrl]);

  useEffect(() => {
    if (isDesktopViewport) {
      return;
    }
    const element = wrapRef.current;
    if (!element) {
      return;
    }
    const updateWidth = () => {
      const nextWidth = Math.max(280, Math.floor(element.clientWidth - 16));
      setBasePageWidth(nextWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isDesktopViewport]);

  useEffect(() => {
    zoomRef.current = zoom;
    syncVisualZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    if (isPinchingRef.current) {
      return;
    }
    if (Math.abs(zoom - renderZoom) < 0.01) {
      return;
    }
    if (renderZoomTimerRef.current) {
      clearTimeout(renderZoomTimerRef.current);
    }
    renderZoomTimerRef.current = setTimeout(() => {
      setRenderZoom(Math.min(zoom, MAX_RENDER_ZOOM));
      renderZoomTimerRef.current = null;
    }, 180);
    return () => {
      if (renderZoomTimerRef.current) {
        clearTimeout(renderZoomTimerRef.current);
        renderZoomTimerRef.current = null;
      }
    };
  }, [renderZoom, zoom]);

  useEffect(() => {
    if (isDesktopViewport) {
      return;
    }
    const element = wrapRef.current;
    if (!element) {
      return;
    }

    const transformNode = transformRef.current;
    const clampZoom = (value: number) =>
      Math.min(MAX_ZOOM, Math.max(0.6, value));
    const getTouchDistance = (touches: TouchList) => {
      if (touches.length < 2) {
        return null;
      }
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    const getTouchCenter = (touches: TouchList) => {
      if (touches.length < 2) {
        return null;
      }
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (momentumFrameRef.current !== null) {
        window.cancelAnimationFrame(momentumFrameRef.current);
        momentumFrameRef.current = null;
      }
      const distance = getTouchDistance(event.touches);
      const center = getTouchCenter(event.touches);
      if (distance && center) {
        isPinchingRef.current = true;
        transformNode?.querySelectorAll("canvas").forEach((canvas) => {
          canvas.style.pointerEvents = "none";
        });
        pinchStartDistanceRef.current = distance;
        pinchStartZoomRef.current = zoomRef.current;
        const rect = element.getBoundingClientRect();
        const centerOffsetX = center.x - rect.left;
        const centerOffsetY = center.y - rect.top;
        pinchAnchorRef.current = {
          localX: element.scrollLeft + centerOffsetX,
          localY: element.scrollTop + centerOffsetY,
          centerOffsetX,
          centerOffsetY,
        };
        panStartRef.current = null;
        event.preventDefault();
        return;
      }

      if (event.touches.length === 1) {
        const touch = event.touches[0];
        panStartRef.current = {
          touchX: touch.clientX,
          touchY: touch.clientY,
          scrollLeft: element.scrollLeft,
          scrollTop: element.scrollTop,
          lastTouchX: touch.clientX,
          lastTouchY: touch.clientY,
          lastTs: performance.now(),
          vx: 0,
          vy: 0,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const startDistance = pinchStartDistanceRef.current;
      const currentDistance = getTouchDistance(event.touches);
      const center = getTouchCenter(event.touches);
      if (
        startDistance &&
        currentDistance &&
        center &&
        pinchAnchorRef.current
      ) {
        const nextZoom = clampZoom(
          pinchStartZoomRef.current * (currentDistance / startDistance),
        );
        if (Math.abs(nextZoom - zoomRef.current) < 0.003) {
          event.preventDefault();
          return;
        }
        const rect = element.getBoundingClientRect();
        const currentCenterOffsetX = center.x - rect.left;
        const currentCenterOffsetY = center.y - rect.top;
        const centerDx =
          currentCenterOffsetX - pinchAnchorRef.current.centerOffsetX;
        const centerDy =
          currentCenterOffsetY - pinchAnchorRef.current.centerOffsetY;
        const stabilizedCenterOffsetX =
          Math.abs(centerDx) < 1.2
            ? pinchAnchorRef.current.centerOffsetX
            : pinchAnchorRef.current.centerOffsetX + centerDx * 0.78;
        const stabilizedCenterOffsetY =
          Math.abs(centerDy) < 2.2
            ? pinchAnchorRef.current.centerOffsetY
            : pinchAnchorRef.current.centerOffsetY + centerDy * 0.52;
        const ratio = nextZoom / Math.max(0.01, pinchStartZoomRef.current);
        const targetLocalX = pinchAnchorRef.current.localX * ratio;
        const targetLocalY = pinchAnchorRef.current.localY * ratio;
        element.scrollLeft = targetLocalX - stabilizedCenterOffsetX;
        element.scrollTop = targetLocalY - stabilizedCenterOffsetY;
        zoomRef.current = nextZoom;
        syncVisualZoom(nextZoom);
        event.preventDefault();
        return;
      }

      if (isPinchingRef.current) {
        return;
      }

      if (event.touches.length === 1 && panStartRef.current) {
        const touch = event.touches[0];
        const dx = touch.clientX - panStartRef.current.touchX;
        const dy = touch.clientY - panStartRef.current.touchY;
        element.scrollLeft = panStartRef.current.scrollLeft - dx;
        element.scrollTop = panStartRef.current.scrollTop - dy;

        const now = performance.now();
        const dt = Math.max(8, now - panStartRef.current.lastTs);
        const stepDx = touch.clientX - panStartRef.current.lastTouchX;
        const stepDy = touch.clientY - panStartRef.current.lastTouchY;
        const nextVx = stepDx / dt;
        const nextVy = stepDy / dt;
        panStartRef.current.vx = panStartRef.current.vx * 0.4 + nextVx * 0.6;
        panStartRef.current.vy = panStartRef.current.vy * 0.4 + nextVy * 0.6;
        panStartRef.current.lastTouchX = touch.clientX;
        panStartRef.current.lastTouchY = touch.clientY;
        panStartRef.current.lastTs = now;

        event.preventDefault();
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const committedZoomCandidate = zoomRef.current;
      if (event.touches.length < 2) {
        isPinchingRef.current = false;
        transformNode?.querySelectorAll("canvas").forEach((canvas) => {
          canvas.style.pointerEvents = "";
        });
        pinchStartDistanceRef.current = null;
        pinchAnchorRef.current = null;
        const committedRenderZoom = Math.min(
          committedZoomCandidate,
          MAX_RENDER_ZOOM,
        );
        startTransition(() => {
          setZoom((prev) =>
            Math.abs(prev - committedZoomCandidate) < 0.01
              ? prev
              : committedZoomCandidate,
          );
          setRenderZoom((prev) =>
            Math.abs(prev - committedRenderZoom) < 0.01
              ? prev
              : committedRenderZoom,
          );
        });
      }
      const pan = panStartRef.current;
      if (pan && !isPinchingRef.current && event.touches.length === 0) {
        const dragDx = pan.lastTouchX - pan.touchX;
        const dragDy = pan.lastTouchY - pan.touchY;
        const dragDistance = Math.hypot(dragDx, dragDy);
        const flingSpeed = Math.hypot(pan.vx, pan.vy);
        const sampleAge = performance.now() - pan.lastTs;
        if (
          dragDistance < MIN_FLING_DISTANCE_PX ||
          flingSpeed < MIN_FLING_SPEED ||
          sampleAge > MAX_FLING_SAMPLE_AGE_MS
        ) {
          panStartRef.current = null;
          return;
        }

        let velocityX = pan.vx * MOMENTUM_BOOST;
        let velocityY = pan.vy * MOMENTUM_BOOST;
        const deceleration = 0.992;
        const minVelocity = 0.5;

        const stepMomentum = () => {
          velocityX *= deceleration;
          velocityY *= deceleration;
          const maxScrollLeft = element.scrollWidth - element.clientWidth;
          const maxScrollTop = element.scrollHeight - element.clientHeight;
          element.scrollLeft = Math.max(
            0,
            Math.min(maxScrollLeft, element.scrollLeft - velocityX),
          );
          element.scrollTop = Math.max(
            0,
            Math.min(maxScrollTop, element.scrollTop - velocityY),
          );

          if (
            Math.abs(velocityX) < minVelocity &&
            Math.abs(velocityY) < minVelocity
          ) {
            momentumFrameRef.current = null;
            return;
          }
          momentumFrameRef.current = window.requestAnimationFrame(stepMomentum);
        };

        if (
          Math.abs(velocityX) > minVelocity ||
          Math.abs(velocityY) > minVelocity
        ) {
          momentumFrameRef.current = window.requestAnimationFrame(stepMomentum);
        }
      }
      panStartRef.current = null;
    };

    element.addEventListener("touchstart", onTouchStart, { passive: false });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
      if (momentumFrameRef.current !== null) {
        window.cancelAnimationFrame(momentumFrameRef.current);
        momentumFrameRef.current = null;
      }
      transformNode?.querySelectorAll("canvas").forEach((canvas) => {
        canvas.style.pointerEvents = "";
      });
    };
  }, [isDesktopViewport]);

  useEffect(() => {
    if (isDesktopViewport) {
      return;
    }
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(sourceUrl);
    setFatalError(null);
    setIsPdfLoading(true);

    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          return;
        }
        const typed = doc as unknown as PdfJsDocument;
        setPdfDoc(typed);
        setPageCount(typed.numPages || 0);
        setRenderedPageLimit(
          Math.min(RENDER_CHUNK_SIZE, Math.max(0, typed.numPages || 0)),
        );
        setIsPdfLoading(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setFatalError(String(error));
        setIsPdfLoading(false);
      });

    return () => {
      cancelled = true;
      try {
        loadingTask.destroy();
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, [isDesktopViewport, sourceUrl]);

  useEffect(() => {
    if (isDesktopViewport) {
      return;
    }
    if (pageCount < 1 || renderedPageLimit >= pageCount) {
      return;
    }
    const root = wrapRef.current;
    const target = loadMoreRef.current;
    if (!root || !target) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          setRenderedPageLimit((prev) =>
            Math.min(pageCount, prev + RENDER_CHUNK_SIZE),
          );
        }
      },
      {
        root,
        rootMargin: `0px 0px ${CHUNK_PRELOAD_MARGIN_PX}px 0px`,
        threshold: 0.01,
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isDesktopViewport, pageCount, renderedPageLimit]);

  useEffect(() => {
    if (isDesktopViewport || !pdfDoc || renderedPageLimit < 1) {
      return;
    }
    const doc = pdfDoc;
    let cancelled = false;
    const activeTasks: Array<{ cancel?: () => void }> = [];

    async function renderPages() {
      for (let pageNumber = 1; pageNumber <= renderedPageLimit; pageNumber += 1) {
        if (cancelled) {
          return;
        }
        await new Promise((resolve) => {
          window.setTimeout(resolve, 0);
        });
        if (cancelled) {
          return;
        }
        const canvas = canvasRefs.current.get(pageNumber);
        if (!canvas) {
          continue;
        }
        try {
          const pageProxy = await doc.getPage(pageNumber);
          const baseViewport = pageProxy.getViewport({ scale: 1 });
          const displayScale = pageWidth / Math.max(1, baseViewport.width);
          const displayViewport = pageProxy.getViewport({
            scale: displayScale,
          });
          const pixelRatio = Math.min(
            3,
            Math.max(
              1,
              typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
            ),
          );
          const renderViewport = pageProxy.getViewport({
            scale: displayScale * pixelRatio * renderZoom,
          });
          const scratchCanvas = document.createElement("canvas");
          scratchCanvas.width = Math.floor(renderViewport.width);
          scratchCanvas.height = Math.floor(renderViewport.height);
          const scratchContext = scratchCanvas.getContext("2d");
          if (!scratchContext) {
            throw new Error(`Page ${pageNumber}: no offscreen 2d context`);
          }
          const renderTask = pageProxy.render({
            canvasContext: scratchContext,
            viewport: renderViewport,
          });
          activeTasks.push(renderTask);
          await renderTask.promise;
          if (cancelled) {
            return;
          }

          const targetPixelWidth = Math.floor(renderViewport.width);
          const targetPixelHeight = Math.floor(renderViewport.height);
          if (
            canvas.width !== targetPixelWidth ||
            canvas.height !== targetPixelHeight
          ) {
            canvas.width = targetPixelWidth;
            canvas.height = targetPixelHeight;
          }
          canvas.style.width = `${Math.floor(displayViewport.width)}px`;
          canvas.style.height = `${Math.floor(displayViewport.height)}px`;
          const visibleContext = canvas.getContext("2d");
          if (!visibleContext) {
            throw new Error(`Page ${pageNumber}: no visible 2d context`);
          }
          visibleContext.setTransform(1, 0, 0, 1, 0, 0);
          visibleContext.drawImage(scratchCanvas, 0, 0);
        } catch (error) {
          const cancellationName =
            typeof error === "object" && error !== null && "name" in error
              ? String((error as { name?: unknown }).name)
              : "";
          const cancellationMessage = String(error);
          const isRenderCancelled =
            cancellationName === "RenderingCancelledException" ||
            cancellationMessage.includes("RenderingCancelledException");
          if (isRenderCancelled || cancelled) {
            continue;
          }
          setFatalError(String(error));
          return;
        }
      }
    }

    void renderPages();
    return () => {
      cancelled = true;
      for (const task of activeTasks) {
        try {
          task.cancel?.();
        } catch {
          // Ignore cancellation errors.
        }
      }
    };
  }, [isDesktopViewport, pageWidth, pdfDoc, renderedPageLimit, renderZoom]);

  const desktopSrc = useMemo(() => withPdfZoom(sourceUrl), [sourceUrl]);

  return (
    <div
      className={isDesktopViewport ? "pdf-modal-backdrop" : "doj-mobile-viewer-backdrop"}
      onClick={onClose}
      role="presentation"
    >
      {isDesktopViewport ? (
        <section
          className="pdf-modal panel"
          role="dialog"
          aria-modal="true"
          aria-label={title || "PDF Preview"}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="pdf-modal-head">
            <h2>{title || "PDF Preview"}</h2>
            <div className="pdf-modal-actions">
              <ShareButton
                className="bookmark-btn"
                url={shareUrl}
                title={shareTitle}
                text={shareText}
                label="Share"
              />
              <button
                type="button"
                className="bookmark-btn"
                onClick={() => void onUpvoteDoc()}
                disabled={!canUpvote || userVoted || isVoting}
                aria-label="Upvote"
              >
                ▲ {upvoteCount}
              </button>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </header>
          <div className="pdf-modal-body">
            <div className="pdf-modal-frame-wrap">
              <iframe
                src={desktopSrc}
                title={title || "PDF Preview"}
                className="pdf-modal-frame"
              />
            </div>
          </div>
        </section>
      ) : (
        <section
          className="doj-mobile-viewer-modal deleted-debug-root deleted-browser-mobile-shell"
          role="dialog"
          aria-modal="true"
          aria-label={title || "Mobile PDF Viewer"}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="deleted-debug-topbar doj-mobile-viewer-topbar">
            <ShareButton
              className="deleted-debug-mobile-share-btn"
              disabled={!shareUrl}
              url={shareUrl}
              title={shareTitle}
              text={shareText}
              label="Share"
            />
            <div className="deleted-debug-top-main">
              <div className="deleted-debug-meta">
                <p className="deleted-debug-kicker">{kicker}</p>
                <p className="deleted-debug-fileline">{title || "PDF Viewer"}</p>
              </div>
            </div>
            <button
              type="button"
              className="deleted-debug-btn deleted-debug-btn-secondary"
              disabled={!canUpvote || userVoted || isVoting}
              onClick={() => void onUpvoteDoc()}
              aria-label="Upvote"
            >
              ▲ {upvoteCount}
            </button>
            <button
              type="button"
              className="doj-mobile-viewer-close"
              onClick={onClose}
              aria-label="Close viewer"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div
            ref={wrapRef}
            className="deleted-debug-pdf-scroll deleted-debug-pdf-scroll-custom"
          >
            <div ref={transformRef} className="deleted-debug-transform">
              {Array.from({ length: renderedPageLimit }, (_, idx) => {
                const pageNumber = idx + 1;
                return (
                  <div key={`mobile-page-${pageNumber}`} className="deleted-debug-page">
                    <canvas
                      ref={(node) => {
                        if (!node) {
                          canvasRefs.current.delete(pageNumber);
                          return;
                        }
                        canvasRefs.current.set(pageNumber, node);
                      }}
                    />
                  </div>
                );
              })}
              {renderedPageLimit < pageCount ? (
                <div ref={loadMoreRef} className="deleted-debug-page">
                  <p className="deleted-debug-error">
                    Loading more pages... ({renderedPageLimit}/{pageCount})
                  </p>
                </div>
              ) : null}
              {isPdfLoading && pageCount < 1 ? (
                <p className="deleted-debug-error">Loading PDF pages...</p>
              ) : null}
              {fatalError ? (
                <p className="deleted-debug-error">
                  Unable to render PDF.{" "}
                  <a href={sourceUrl} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
