"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { logClientVerbose } from "@/lib/logging";
import { loadPdfJsModule } from "@/lib/client/load-pdfjs";
import { createPdfDocumentTask } from "@/lib/client/pdfjs-document-load";

type ContinuousPdfViewerProps = {
  sourceUrl: string;
  title: string;
  className?: string;
  onViewerScroll?: (scrollTop: number) => void;
  onViewerTap?: () => void;
};

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy?: () => void;
};

type PdfJsPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel?: () => void };
};

export default function ContinuousPdfViewer({
  sourceUrl,
  title,
  className,
  onViewerScroll,
  onViewerTap,
}: ContinuousPdfViewerProps) {
  const usePdfJsRenderer = false;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const zoomRef = useRef(1);
  const pendingZoomRef = useRef<number | null>(null);
  const pinchFrameRef = useRef<number | null>(null);
  const panStartRef = useRef<{
    touchX: number;
    touchY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const movedSinceTouchStartRef = useRef(false);
  const [pdfjs, setPdfjs] = useState<null | {
    getDocument: (src: unknown) => { promise: Promise<unknown>; destroy?: () => void };
  }>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [rendererInitError, setRendererInitError] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [basePageWidth, setBasePageWidth] = useState(960);
  const [zoom, setZoom] = useState(1);
  const [visiblePages, setVisiblePages] = useState<number[]>([]);
  const [pageAspectRatios, setPageAspectRatios] = useState<Record<number, number>>({});
  const [isClient, setIsClient] = useState(false);
  const pageWidth = Math.max(280, Math.floor(basePageWidth * zoom));
  const visiblePageSet = useMemo(() => new Set(visiblePages), [visiblePages]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setPdfDoc(null);
    setPageCount(0);
    setPdfLoadError(null);
    setZoom(1);
    setVisiblePages([]);
    setPageAspectRatios({});
    canvasRefs.current.clear();
    pageSlotRefs.current.clear();
    logClientVerbose("continuous-pdf-viewer", "Source URL changed", {
      sourceUrl,
    });
  }, [sourceUrl]);

  useEffect(() => {
    if (pageCount < 1) {
      setVisiblePages([]);
      return;
    }
    setVisiblePages(Array.from({ length: Math.min(pageCount, 3) }, (_, idx) => idx + 1));
  }, [pageCount]);

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
  }, []);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) {
      return;
    }

    const clampZoom = (value: number) => Math.min(3, Math.max(0.75, value));
    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) {
        return null;
      }
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (event: TouchEvent) => {
      movedSinceTouchStartRef.current = false;
      const distance = getDistance(event.touches);
      if (distance) {
        panStartRef.current = null;
        pinchStartDistanceRef.current = distance;
        pinchStartZoomRef.current = zoomRef.current;
        event.preventDefault();
        return;
      }

      if (event.touches.length === 1 && zoomRef.current > 1) {
        const touch = event.touches[0];
        panStartRef.current = {
          touchX: touch.clientX,
          touchY: touch.clientY,
          scrollLeft: element.scrollLeft,
          scrollTop: element.scrollTop,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const startDistance = pinchStartDistanceRef.current;
      const currentDistance = getDistance(event.touches);
      if (startDistance && currentDistance) {
        movedSinceTouchStartRef.current = true;
        const nextZoom = clampZoom(pinchStartZoomRef.current * (currentDistance / startDistance));
        pendingZoomRef.current = nextZoom;
        if (pinchFrameRef.current === null) {
          pinchFrameRef.current = window.requestAnimationFrame(() => {
            pinchFrameRef.current = null;
            const pending = pendingZoomRef.current;
            if (pending === null) {
              return;
            }
            setZoom((prev) => (Math.abs(prev - pending) < 0.01 ? prev : pending));
          });
        }
        event.preventDefault();
        return;
      }

      if (event.touches.length === 1 && panStartRef.current && zoomRef.current > 1) {
        movedSinceTouchStartRef.current = true;
        const touch = event.touches[0];
        const dx = touch.clientX - panStartRef.current.touchX;
        const dy = touch.clientY - panStartRef.current.touchY;
        element.scrollLeft = panStartRef.current.scrollLeft - dx;
        element.scrollTop = panStartRef.current.scrollTop - dy;
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (pinchStartDistanceRef.current !== null) {
        pinchStartDistanceRef.current = null;
      }
      if (pendingZoomRef.current !== null) {
        const next = pendingZoomRef.current;
        pendingZoomRef.current = null;
        setZoom((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
      }
      if (!movedSinceTouchStartRef.current) {
        onViewerTap?.();
      }
      panStartRef.current = null;
    };

    const preventGestureDefault = (event: Event) => {
      event.preventDefault();
    };

    element.addEventListener("touchstart", onTouchStart, { passive: false });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);
    element.addEventListener("gesturestart", preventGestureDefault as EventListener, {
      passive: false,
    });
    element.addEventListener("gesturechange", preventGestureDefault as EventListener, {
      passive: false,
    });
    element.addEventListener("gestureend", preventGestureDefault as EventListener, {
      passive: false,
    });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
      element.removeEventListener(
        "gesturestart",
        preventGestureDefault as EventListener,
      );
      element.removeEventListener(
        "gesturechange",
        preventGestureDefault as EventListener,
      );
      element.removeEventListener(
        "gestureend",
        preventGestureDefault as EventListener,
      );
      if (pinchFrameRef.current !== null) {
        window.cancelAnimationFrame(pinchFrameRef.current);
        pinchFrameRef.current = null;
      }
      pendingZoomRef.current = null;
    };
  }, [onViewerTap]);

  useEffect(() => {
    if (!usePdfJsRenderer) {
      return;
    }
    let isMounted = true;
    async function initPdfjs() {
      try {
        logClientVerbose("continuous-pdf-viewer", "Initializing custom pdfjs renderer", {
          sourceUrl,
        });
        const loaded = await loadPdfJsModule();
        if (!isMounted) {
          return;
        }
        setPdfjs({
          getDocument: loaded.pdfjs.getDocument,
        });
        setRendererFailed(false);
        setRendererInitError(null);
        logClientVerbose("continuous-pdf-viewer", "pdfjs initialized", {
          sourceUrl,
          version: loaded.version,
          worker: loaded.workerSrc,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setRendererFailed(true);
        setRendererInitError(String(error));
        logClientVerbose("continuous-pdf-viewer", "pdfjs init failed", {
          sourceUrl,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    void initPdfjs();
    return () => {
      isMounted = false;
    };
  }, [sourceUrl, usePdfJsRenderer]);

  useEffect(() => {
    if (!usePdfJsRenderer) {
      return;
    }
    if (!pdfjs) {
      return;
    }

    let isCancelled = false;
    const task = createPdfDocumentTask(pdfjs.getDocument, sourceUrl);

    task.promise
      .then((doc) => {
        if (isCancelled) {
          return;
        }
        const typedDoc = doc as PdfJsDocument;
        setPdfDoc(typedDoc);
        setPageCount(typedDoc.numPages || 0);
        setPdfLoadError(null);
        logClientVerbose("continuous-pdf-viewer", "PDF loaded", {
          sourceUrl,
          numPages: typedDoc.numPages,
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        setPdfLoadError(String(error));
        logClientVerbose("continuous-pdf-viewer", "PDF load failed", {
          sourceUrl,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      });

    return () => {
      isCancelled = true;
      try {
        task.destroy?.();
      } catch {
        // Ignore cleanup failures.
      }
    };
  }, [pdfjs, sourceUrl, usePdfJsRenderer]);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root || pageCount < 1) {
      return;
    }

    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            const page = Number(target.dataset.page);
            if (!Number.isFinite(page) || page < 1 || page > pageCount) {
              continue;
            }
            if (entry.isIntersecting) {
              next.add(page);
              if (page > 1) {
                next.add(page - 1);
              }
              if (page < pageCount) {
                next.add(page + 1);
              }
            }
          }
          if (next.size === 0) {
            next.add(1);
          }
          return Array.from(next).sort((a, b) => a - b);
        });
      },
      {
        root,
        rootMargin: "120% 0px",
        threshold: 0.01,
      },
    );
    observerRef.current = observer;

    for (const element of pageSlotRefs.current.values()) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [pageCount]);

  useEffect(() => {
    if (!usePdfJsRenderer) {
      return;
    }
    if (!pdfDoc || pageCount < 1 || visiblePages.length < 1) {
      return;
    }
    const doc = pdfDoc;

    let isCancelled = false;
    const activeTasks: Array<{ cancel?: () => void }> = [];

    async function renderVisiblePages() {
      for (const pageNumber of visiblePages) {
        if (isCancelled) {
          return;
        }
        const canvas = canvasRefs.current.get(pageNumber);
        if (!canvas) {
          continue;
        }
        try {
          const pageProxy = await doc.getPage(pageNumber);
          const baseViewport = pageProxy.getViewport({ scale: 1 });
          const nextRatio = baseViewport.height / Math.max(1, baseViewport.width);
          setPageAspectRatios((prev) =>
            prev[pageNumber] ? prev : { ...prev, [pageNumber]: nextRatio },
          );
          const scale = pageWidth / Math.max(1, baseViewport.width);
          const viewport = pageProxy.getViewport({ scale });
          const displayWidth = Math.floor(viewport.width);
          const displayHeight = Math.floor(viewport.height);
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Could not get 2d canvas context");
          }
          const renderTask = pageProxy.render({
            canvasContext: context,
            viewport,
          });
          activeTasks.push(renderTask);
          await renderTask.promise;
        } catch (error) {
          if (!isCancelled) {
            setPdfLoadError(String(error));
            logClientVerbose("continuous-pdf-viewer", "Page render failed", {
              sourceUrl,
              pageNumber,
              error: String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          }
          return;
        }
      }
      if (!isCancelled) {
        logClientVerbose("continuous-pdf-viewer", "Rendered visible pages", {
          sourceUrl,
          visiblePages,
          pageCount,
          zoom,
          pageWidth,
        });
      }
    }

    void renderVisiblePages();
    return () => {
      isCancelled = true;
      for (const task of activeTasks) {
        try {
          task.cancel?.();
        } catch {
          // Ignore cancellation errors.
        }
      }
    };
  }, [pageCount, pageWidth, pdfDoc, sourceUrl, usePdfJsRenderer, visiblePages, zoom]);

  return (
    <div
      ref={wrapRef}
      className={className ?? "deleted-browser-pdf-scroll"}
      style={{ touchAction: zoom > 1 ? "none" : "pan-y pinch-zoom" }}
      onScroll={(event) => {
        onViewerScroll?.(event.currentTarget.scrollTop);
      }}
      onClick={() => onViewerTap?.()}
    >
      <div className="pdf-debug-chip">
        {isClient
          ? `renderer=${rendererFailed ? "error" : "pdfjs"} pages=${pageCount || 0} zoom=${zoom.toFixed(2)} width=${pageWidth}`
          : "renderer=init"}
      </div>

      {rendererFailed ? (
        <p className="empty">Custom PDF renderer failed to initialize for {title}.</p>
      ) : null}
      {rendererInitError ? <p className="empty mono">Renderer init error: {rendererInitError}</p> : null}
      {pdfLoadError ? <p className="empty mono">PDF load error: {pdfLoadError}</p> : null}

      {!usePdfJsRenderer && sourceUrl ? (
        <iframe
          src={sourceUrl}
          title={title}
          style={{ width: "100%", minHeight: "70vh", border: "none" }}
        />
      ) : null}

      {usePdfJsRenderer && !rendererFailed && !pdfLoadError && pageCount > 0 ? (
        Array.from({ length: pageCount }, (_, index) => {
          const pageNumber = index + 1;
          const ratio = pageAspectRatios[pageNumber] ?? 1.32;
          const minHeight = Math.max(280, Math.round(pageWidth * ratio));
          return (
            <div
              key={`page-${pageNumber}`}
              className="deleted-browser-pdf-page"
              data-page={pageNumber}
              style={{ minHeight: `${minHeight}px` }}
              ref={(node) => {
                const observer = observerRef.current;
                if (!node) {
                  const previous = pageSlotRefs.current.get(pageNumber);
                  if (observer && previous) {
                    observer.unobserve(previous);
                  }
                  pageSlotRefs.current.delete(pageNumber);
                  return;
                }
                pageSlotRefs.current.set(pageNumber, node);
                observer?.observe(node);
              }}
            >
              {visiblePageSet.has(pageNumber) ? (
                <canvas
                  ref={(node) => {
                    if (!node) {
                      canvasRefs.current.delete(pageNumber);
                      return;
                    }
                    canvasRefs.current.set(pageNumber, node);
                  }}
                />
              ) : (
                <div className="deleted-browser-page-placeholder" aria-hidden="true">
                  Page {pageNumber}
                </div>
              )}
            </div>
          );
        })
      ) : (
        usePdfJsRenderer && !rendererFailed && <p className="empty">Loading PDF...</p>
      )}
    </div>
  );
}
