"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ShareButton from "@/components/share-button";
import { createPdfDocumentTask } from "@/lib/client/pdfjs-document-load";

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

type LogEntry = {
  id: number;
  message: string;
};

const DEBUG_IDS = ["EFTA00003862", "EFTA00514650"] as const;
type DebugEftaId = (typeof DEBUG_IDS)[number];
const DEBUG_DATASET_ID = "9";
const MAX_ZOOM = 3.5;
const MAX_RENDER_ZOOM = 2;
const MOMENTUM_BOOST = 18;
const MIN_FLING_DISTANCE_PX = 22;
const MIN_FLING_SPEED = 0.14; // px/ms from touch sampling
const MAX_FLING_SAMPLE_AGE_MS = 70;

export default function DeletedDocsBrowserDebugClient() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<HTMLDivElement | null>(null);
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
  const [, setLogs] = useState<LogEntry[]>([]);
  const [selectedId] = useState<DebugEftaId>(DEBUG_IDS[0]);
  const [pdfjs] = useState<null | {
    getDocument: (src: unknown) => {
      promise: Promise<unknown>;
      destroy?: () => void;
    };
  }>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [basePageWidth, setBasePageWidth] = useState(960);
  const [zoom, setZoom] = useState(1);
  const [renderZoom, setRenderZoom] = useState(1);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState("");
  const pageWidth = Math.max(280, Math.floor(basePageWidth));

  const syncVisualZoom = useCallback((nextZoom: number) => {
    const node = transformRef.current;
    if (!node) {
      return;
    }
    node.style.zoom = String(nextZoom);
  }, []);

  const setVisualZoom = useCallback(
    (nextZoom: number) => {
      zoomRef.current = nextZoom;
      syncVisualZoom(nextZoom);
    },
    [syncVisualZoom],
  );

  const pushLog = useCallback((message: string) => {
    // debug.terminal(`[deleted-docs-browser-debug] ${message}`);
    // debug.file(`[deleted-docs-browser-debug] ${message}`);
    setLogs((prev) => {
      const entry: LogEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        message: `${new Date().toISOString()} ${message}`,
      };
      const next = [...prev, entry];
      return next.slice(-200);
    });
  }, []);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}/deleted-docs-browser?id=${encodeURIComponent(selectedId)}`;
  }, [selectedId]);
  const shareTitle = useMemo(() => `Deleted file ${selectedId}`, [selectedId]);
  const shareText = useMemo(
    () => `Deleted DOJ file ${selectedId} (Dataset ${DEBUG_DATASET_ID})`,
    [selectedId],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadDocumentUrl() {
      try {
        const response = await fetch(
          `/api/deleted-browser/file?id=${encodeURIComponent(selectedId)}`,
        );
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
          throw new Error(
            payload.error || "Failed to load deleted file metadata",
          );
        }
        const directUrl =
          payload.file?.sources?.original_link?.trim() ||
          payload.file?.sources?.doj_link?.trim() ||
          "";
        if (!isCancelled) {
          setDocumentUrl(directUrl);
        }
      } catch (error) {
        if (!isCancelled) {
          setDocumentUrl("");
          setFatalError(String(error));
        }
      }
    }

    void loadDocumentUrl();
    return () => {
      isCancelled = true;
    };
  }, [selectedId]);
  useEffect(() => {
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
  }, [pushLog]);

  useEffect(() => {
    zoomRef.current = zoom;
    syncVisualZoom(zoom);
  }, [syncVisualZoom, zoom]);

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
          // Commit crisp rerender once pinch interaction ends.
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
  }, [setVisualZoom]);

  useEffect(() => {
    setPdfDoc(null);
    setPageCount(0);
    setFatalError(null);
    setZoom(1);
    setRenderZoom(1);
    canvasRefs.current.clear();
    zoomRef.current = 1;
    syncVisualZoom(1);
    pushLog(`Selected debug file: ${selectedId}`);
  }, [pushLog, selectedId, syncVisualZoom]);

  useEffect(() => {
    if (!pdfjs || !documentUrl) {
      return;
    }

    let cancelled = false;
    setFatalError(null);
    pushLog(`Loading PDF document: ${documentUrl}`);
    const task = createPdfDocumentTask(pdfjs.getDocument, documentUrl);

    task.promise
      .then((doc) => {
        if (cancelled) {
          return;
        }
        const typed = doc as PdfJsDocument;
        setPdfDoc(typed);
        setPageCount(typed.numPages || 0);
        pushLog(`PDF loaded: numPages=${typed.numPages || 0}`);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = String(error);
        setFatalError(message);
        pushLog(`PDF load failed: ${message}`);
      });

    return () => {
      cancelled = true;
      try {
        task.destroy?.();
      } catch {
        // Ignore cleanup errors for debug page.
      }
    };
  }, [documentUrl, pdfjs, pushLog]);

  useEffect(() => {
    if (!pdfDoc || pageCount < 1) {
      return;
    }
    const doc = pdfDoc;

    let cancelled = false;
    const activeTasks: Array<{ cancel?: () => void }> = [];

    async function renderAllPages() {
      pushLog(
        `Rendering pages with targetWidth=${pageWidth} renderZoom=${renderZoom.toFixed(2)}`,
      );
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
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
            // Keep CSS/layout size stable; increase only raster density for crispness.
            scale: displayScale * pixelRatio * renderZoom,
          });
          // Render offscreen first so the visible canvas doesn't flash while rerendering.
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

          pushLog(
            `Rendered page ${pageNumber}/${pageCount} zoom=${zoomRef.current.toFixed(2)} rZoom=${renderZoom.toFixed(2)} dpr=${pixelRatio.toFixed(2)}`,
          );
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
            // Expected when a new render pass supersedes the previous one.
            continue;
          }
          const message = String(error);
          setFatalError(message);
          pushLog(`Render failed page=${pageNumber}: ${message}`);
          return;
        }
      }
      pushLog("Render complete");
    }

    void renderAllPages();
    return () => {
      cancelled = true;
      for (const task of activeTasks) {
        try {
          task.cancel?.();
        } catch {
          // Ignore cancellation errors for debug page.
        }
      }
    };
  }, [pageWidth, pageCount, pdfDoc, pushLog, renderZoom]);

  return (
    <main className="deleted-debug-root">
      <div className="deleted-debug-topbar">
        <ShareButton
          className="deleted-debug-mobile-share-btn"
          url={shareUrl}
          title={shareTitle}
          text={shareText}
        />
        <div className="deleted-debug-top-main">
          <div className="deleted-debug-meta">
            <p className="deleted-debug-kicker">Deleted Docs Browser</p>
            <p className="deleted-debug-fileline">{selectedId}</p>
          </div>
          <div className="deleted-debug-status">
            <span className="deleted-debug-chip">
              Dataset {DEBUG_DATASET_ID}
            </span>
            <span className="deleted-debug-chip">Deleted by DOJ</span>
          </div>
        </div>
        <div className="deleted-debug-controls-row">
          {/* <p className="deleted-debug-source">Future details section.</p> */}
          <div className="deleted-debug-controls">
            <div className="deleted-debug-zoom-group">
              <button
                type="button"
                className="deleted-debug-btn"
                onClick={() =>
                  setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))
                }
              >
                Previous
              </button>
              <button
                type="button"
                className="deleted-debug-btn deleted-debug-btn-secondary"
                onClick={() => setZoom(1)}
              >
                Upvote
              </button>
              <button
                type="button"
                className="deleted-debug-btn"
                onClick={() =>
                  setZoom((z) =>
                    Math.min(MAX_ZOOM, Number((z + 0.2).toFixed(2))),
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        </div>
        {fatalError ? (
          <p className="deleted-debug-error">error={fatalError}</p>
        ) : null}
      </div>

      <div ref={wrapRef} className="deleted-debug-pdf-scroll">
        <div ref={transformRef} className="deleted-debug-transform">
          {Array.from({ length: pageCount }, (_, idx) => {
            const pageNumber = idx + 1;
            return (
              <div
                key={`debug-page-${pageNumber}`}
                className="deleted-debug-page"
              >
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
        </div>
      </div>
    </main>
  );
}
