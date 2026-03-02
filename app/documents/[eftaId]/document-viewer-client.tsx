"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import ShareButton from "@/components/share-button";
import { loadPdfJsModule } from "@/lib/client/load-pdfjs";
import { logClientVerbose } from "@/lib/logging";
import { createPdfDocumentTask } from "@/lib/client/pdfjs-document-load";

type DocumentViewerClientProps = {
  eftaId: string;
};

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

const MAX_ZOOM = 3.5;
const MAX_RENDER_ZOOM = 2;
const MOMENTUM_BOOST = 18;
const MIN_FLING_DISTANCE_PX = 22;
const MIN_FLING_SPEED = 0.14;
const MAX_FLING_SAMPLE_AGE_MS = 70;
const RENDER_CHUNK_SIZE = 12;
const CHUNK_PRELOAD_MARGIN_PX = 1200;

export default function DocumentViewerClient({
  eftaId,
}: DocumentViewerClientProps) {
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
  const [pdfjs, setPdfjs] = useState<null | {
    getDocument: (src: unknown) => {
      promise: Promise<unknown>;
      destroy?: () => void;
    };
  }>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [rendererInitError, setRendererInitError] = useState<string | null>(
    null,
  );
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [renderedPageLimit, setRenderedPageLimit] = useState(0);
  const [basePageWidth, setBasePageWidth] = useState(960);
  const [zoom, setZoom] = useState(1);
  const [renderZoom, setRenderZoom] = useState(1);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [preferNativeFallback, setPreferNativeFallback] = useState(false);
  const usePdfJsRenderer = !isDesktopViewport;
  const useCanvasRenderer = usePdfJsRenderer && !preferNativeFallback;
  const pageWidth = Math.max(280, Math.floor(basePageWidth));

  const metadataUrl = useMemo(
    () => `/api/file/${encodeURIComponent(eftaId)}`,
    [eftaId],
  );
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}/documents/${encodeURIComponent(eftaId)}`;
  }, [eftaId]);
  const shareTitle = useMemo(() => `DOC Viewer ${eftaId}`, [eftaId]);
  const shareText = useMemo(() => `Viewing DOJ document ${eftaId}`, [eftaId]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const media = window.matchMedia("(min-width: 961px)");
    const onChange = () => {
      setIsDesktopViewport(media.matches);
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    async function loadSourceUrl() {
      try {
        const response = await fetch(metadataUrl);
        const payload = (await response.json()) as {
          file?: {
            sources?: {
              original_link?: string | null;
              doj_link?: string | null;
            };
          };
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Failed to resolve PDF source URL");
        }
        const directUrl =
          payload.file?.sources?.original_link?.trim() ||
          payload.file?.sources?.doj_link?.trim() ||
          "";
        if (!directUrl) {
          throw new Error("No direct PDF source URL available");
        }
        if (!isCancelled) {
          setSourceUrl(directUrl);
          setPdfLoadError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setPdfLoadError(String(error));
        }
      }
    }
    void loadSourceUrl();
    return () => {
      isCancelled = true;
    };
  }, [metadataUrl]);

  useEffect(() => {
    if (!usePdfJsRenderer) {
      return;
    }
    let isMounted = true;
    async function initPdfjs() {
      try {
        const loaded = await loadPdfJsModule();
        if (!isMounted) {
          return;
        }
        setPdfjs({
          getDocument: loaded.pdfjs.getDocument,
        });
        setRendererFailed(false);
        setRendererInitError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setRendererFailed(true);
        setRendererInitError(String(error));
      }
    }
    void initPdfjs();
    return () => {
      isMounted = false;
    };
  }, [usePdfJsRenderer]);

  const syncVisualZoom = (nextZoom: number) => {
    const node = transformRef.current;
    if (!node) {
      return;
    }
    node.style.zoom = String(nextZoom);
  };

  const setVisualZoom = (nextZoom: number) => {
    zoomRef.current = nextZoom;
    syncVisualZoom(nextZoom);
  };

  useEffect(() => {
    if (!useCanvasRenderer) {
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
  }, [useCanvasRenderer]);

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
    if (!useCanvasRenderer) {
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
        setVisualZoom(nextZoom);
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
  }, [useCanvasRenderer]);

  useEffect(() => {
    setPdfDoc(null);
    setPageCount(0);
    setRenderedPageLimit(0);
    setPdfLoadError(null);
    setIsPdfLoading(Boolean(eftaId));
    setPreferNativeFallback(false);
    setZoom(1);
    setRenderZoom(1);
    canvasRefs.current.clear();
    zoomRef.current = 1;
    syncVisualZoom(1);
    logClientVerbose("documents/viewer", "Document changed; reset viewer state", {
      eftaId,
      metadataUrl,
    });
  }, [eftaId, metadataUrl]);

  useEffect(() => {
    if (!useCanvasRenderer || isDesktopViewport) {
      return;
    }
    if (!sourceUrl || !pdfjs) {
      return;
    }

    let isCancelled = false;
    const task = createPdfDocumentTask(pdfjs.getDocument, sourceUrl);
    setPdfLoadError(null);
    setIsPdfLoading(true);

    task.promise
      .then((doc) => {
        if (isCancelled) {
          return;
        }
        const typedDoc = doc as unknown as PdfJsDocument;
        setPdfDoc(typedDoc);
        setPageCount(typedDoc.numPages || 0);
        setRenderedPageLimit(
          Math.min(RENDER_CHUNK_SIZE, Math.max(0, typedDoc.numPages || 0)),
        );
        setPreferNativeFallback(false);
        setIsPdfLoading(false);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        const message = String(error);
        setPdfLoadError(message);
        setIsPdfLoading(false);
        logClientVerbose("documents/viewer", "PDF load failed", {
          eftaId,
          sourceUrl,
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
      });

    return () => {
      isCancelled = true;
      try {
        task.destroy?.();
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, [eftaId, isDesktopViewport, pdfjs, sourceUrl, useCanvasRenderer]);

  useEffect(() => {
    if (!useCanvasRenderer || isDesktopViewport) {
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
  }, [isDesktopViewport, pageCount, renderedPageLimit, useCanvasRenderer]);

  useEffect(() => {
    if (!useCanvasRenderer || isDesktopViewport) {
      return;
    }
    if (!pdfDoc || renderedPageLimit < 1) {
      return;
    }
    const doc = pdfDoc;
    let cancelled = false;
    const activeTasks: Array<{ cancel?: () => void }> = [];

    async function renderAllPages() {
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
          const displayViewport = pageProxy.getViewport({ scale: displayScale });
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
            throw new Error(
              `Page ${pageNumber}: failed to acquire offscreen 2d context`,
            );
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
            throw new Error(
              `Page ${pageNumber}: failed to acquire visible 2d context`,
            );
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
          setPdfLoadError(String(error));
          return;
        }
      }
    }

    void renderAllPages();
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
  }, [
    isDesktopViewport,
    pageCount,
    pageWidth,
    pdfDoc,
    renderedPageLimit,
    renderZoom,
    useCanvasRenderer,
  ]);

  function onZoomIn() {
    const next = Math.min(MAX_ZOOM, Number((zoom + 0.15).toFixed(2)));
    setZoom(next);
    setVisualZoom(next);
  }

  function onZoomOut() {
    const next = Math.max(0.6, Number((zoom - 0.15).toFixed(2)));
    setZoom(next);
    setVisualZoom(next);
  }

  return (
    <main className="deleted-debug-root deleted-browser-mobile-shell">
      <section className="panel detail-nav link-bar deleted-browser-desktop-only">
        <div className="deleted-browser-nav-left">
          <button type="button" onClick={() => window.history.back()}>
            Back
          </button>
          <Link href="/search" className="table-link">
            Return to Search
          </Link>
        </div>
        <div className="deleted-browser-nav-right">
          <Link
            href={`/file/${encodeURIComponent(eftaId)}`}
            className="table-link"
          >
            File Details
          </Link>
          <a
            href={sourceUrl || "#"}
            download={`${eftaId}.pdf`}
            className="table-link"
          >
            Download PDF
          </a>
        </div>
      </section>

      <div className="deleted-debug-topbar">
        <ShareButton
          className="deleted-debug-mobile-share-btn"
          disabled={!eftaId}
          url={shareUrl}
          title={shareTitle}
          text={shareText}
        />
        <Link
          href="/search"
          className="deleted-debug-mobile-home-btn"
          aria-label="Return to search"
        >
          ×
        </Link>
        <div className="deleted-debug-top-main">
          <div className="deleted-debug-meta">
            <p className="deleted-debug-kicker">DOC Viewer</p>
            <p className="deleted-debug-fileline">{eftaId}</p>
          </div>
          <div className="deleted-debug-status">
            <span className="deleted-debug-chip">DOJ Search</span>
            <span className="deleted-debug-chip">
              {usePdfJsRenderer ? `Pages ${pageCount || "-"}` : "Native Viewer"}
            </span>
            {usePdfJsRenderer ? (
              <span className="deleted-debug-chip">
                {Math.round(zoom * 100)}%
              </span>
            ) : null}
          </div>
        </div>
        {usePdfJsRenderer ? (
          <div className="deleted-debug-controls-row">
            <div className="deleted-debug-controls">
              <div className="deleted-debug-zoom-group">
                <button
                  type="button"
                  className="deleted-debug-btn deleted-debug-btn-secondary"
                  onClick={onZoomOut}
                >
                  -
                </button>
                <button
                  type="button"
                  className="deleted-debug-btn deleted-debug-btn-secondary"
                  onClick={onZoomIn}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {rendererFailed ? (
          <p className="deleted-debug-error">
            Custom PDF renderer failed to initialize.
          </p>
        ) : null}
        {rendererInitError ? (
          <p className="deleted-debug-error">
            Renderer init error: {rendererInitError}
          </p>
        ) : null}
        {pdfLoadError ? (
          <p className="deleted-debug-error">PDF load error: {pdfLoadError}</p>
        ) : null}
      </div>

      <div
        ref={wrapRef}
        className={`deleted-debug-pdf-scroll${useCanvasRenderer ? " deleted-debug-pdf-scroll-custom" : " deleted-debug-pdf-scroll-native"}`}
      >
        {useCanvasRenderer ? (
          <div ref={transformRef} className="deleted-debug-transform">
            {Array.from({ length: renderedPageLimit }, (_, idx) => {
              const pageNumber = idx + 1;
              return (
                <div key={`doc-page-${pageNumber}`} className="deleted-debug-page">
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
            {!isPdfLoading && pageCount < 1 && !pdfLoadError ? (
              <button
                type="button"
                className="deleted-debug-btn deleted-debug-btn-secondary"
                onClick={() => setPreferNativeFallback(true)}
              >
                Open Native PDF
              </button>
            ) : null}
          </div>
        ) : sourceUrl ? (
          <object
            className="deleted-debug-native-viewer"
            data={sourceUrl}
            type="application/pdf"
            aria-label={`PDF ${eftaId}`}
          >
            <p className="deleted-debug-error">
              Unable to open inline PDF.{" "}
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            </p>
          </object>
        ) : (
          <p className="deleted-debug-error">Loading PDF...</p>
        )}
      </div>
    </main>
  );
}
