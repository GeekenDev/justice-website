"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
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

type LogEntry = {
  id: number;
  message: string;
};

const DEBUG_DATASET_ID = "9";
const MAX_ZOOM = 3.5;
const MAX_RENDER_ZOOM = 2;
const MOMENTUM_BOOST = 18;
const MIN_FLING_DISTANCE_PX = 22;
const MIN_FLING_SPEED = 0.14; // px/ms from touch sampling
const MAX_FLING_SAMPLE_AGE_MS = 70;
const VOTER_ID_KEY = "deleted_doc_voter_id";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

async function diagnosePdfSource(url: string) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    const allowOrigin =
      head.headers.get("access-control-allow-origin") || "none";
    const exposeHeaders =
      head.headers.get("access-control-expose-headers") || "none";
    const acceptRanges = head.headers.get("accept-ranges") || "none";
    const contentType = head.headers.get("content-type") || "unknown";
    return `probe status=${head.status} type=${contentType} allow-origin=${allowOrigin} accept-ranges=${acceptRanges} expose=${exposeHeaders}`;
  } catch (error) {
    return `probe failed=${String(error)}`;
  }
}

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
  const [selectedId, setSelectedId] = useState("");
  const [visitedIds, setVisitedIds] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isNavigatingDoc, setIsNavigatingDoc] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(0);
  const [userVoted, setUserVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [voterId, setVoterId] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const selectedIdRef = useRef("");
  const visitedIdsRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [basePageWidth, setBasePageWidth] = useState(960);
  const [zoom, setZoom] = useState(1);
  const [renderZoom, setRenderZoom] = useState(1);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [preferNativeFallback, setPreferNativeFallback] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  // Use PDF.js on mobile so zoom/pan are scoped to the viewer surface.
  // Desktop continues to use native inline PDF rendering.
  const usePdfJsRenderer = !isDesktopViewport;
  const useCanvasRenderer = usePdfJsRenderer && !preferNativeFallback;
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
    if (typeof window === "undefined" || !selectedId) {
      return "";
    }
    return `${window.location.origin}/deleted-docs-browser?id=${encodeURIComponent(selectedId)}`;
  }, [selectedId]);
  const shareTitle = useMemo(
    () => (selectedId ? `Deleted file ${selectedId}` : "Deleted file"),
    [selectedId],
  );
  const shareText = useMemo(
    () =>
      selectedId
        ? `Deleted DOJ file ${selectedId} (Dataset ${DEBUG_DATASET_ID})`
        : "",
    [selectedId],
  );
  const desktopPdfSourceUrl = useMemo(() => {
    const trimmed = documentUrl.trim();
    return trimmed || "";
  }, [documentUrl]);
  const pdfSourceUrl = useMemo(() => {
    const trimmed = documentUrl.trim();
    return trimmed || "";
  }, [documentUrl]);

  const loadRandomDeletedId = useCallback(async (excludeIds: string[]) => {
    const params = new URLSearchParams();
    if (excludeIds.length > 0) {
      params.set("exclude", excludeIds.join(","));
    }
    const response = await fetch(
      `/api/deleted-browser/random?${params.toString()}`,
    );
    const payload = (await response.json()) as {
      file?: { efta_id?: string };
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load random deleted file");
    }
    const id = (payload.file?.efta_id ?? "").trim().toUpperCase();
    return id || null;
  }, []);

  async function loadDeletedDocVoteState(id: string, currentVoterId: string) {
    const response = await fetch(
      `/api/deleted-browser/file?id=${encodeURIComponent(id)}`,
      {
        headers: currentVoterId ? { "x-voter-id": currentVoterId } : {},
      },
    );
    const payload = (await response.json()) as {
      file?: {
        upvotes?: number;
        userVoted?: boolean;
        sources?: {
          original_link?: string | null;
          doj_link?: string | null;
        };
      };
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load deleted file");
    }
    return {
      upvotes:
        typeof payload.file?.upvotes === "number" ? payload.file.upvotes : 0,
      userVoted: Boolean(payload.file?.userVoted),
      sourceUrl:
        payload.file?.sources?.original_link?.trim() ||
        payload.file?.sources?.doj_link?.trim() ||
        "",
    };
  }

  async function onUpvoteDoc() {
    if (!selectedId || !voterId || userVoted || isVoting) {
      return;
    }
    setIsVoting(true);
    try {
      const response = await fetch("/api/deleted-browser/upvote", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-voter-id": voterId,
        },
        body: JSON.stringify({
          eftaId: selectedId,
        }),
      });
      const payload = (await response.json()) as {
        voteCount?: number;
        alreadyVoted?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to upvote deleted doc");
      }
      if (typeof payload.voteCount === "number") {
        setUpvoteCount(payload.voteCount);
      } else {
        setUpvoteCount((prev) => prev + 1);
      }
      setUserVoted(Boolean(payload.alreadyVoted) || true);
    } catch (error) {
      setFatalError(String(error));
    } finally {
      setIsVoting(false);
    }
  }

  async function onNextDoc() {
    if (!selectedId || isNavigatingDoc) {
      return;
    }

    setIsNavigatingDoc(true);
    try {
      const excludes = new Set<string>(visitedIdsRef.current);
      if (selectedIdRef.current) {
        excludes.add(selectedIdRef.current);
      }
      const nextId = await loadRandomDeletedId(Array.from(excludes));
      if (!nextId) {
        return;
      }

      // Next always creates a new random step from the current point.
      const baseHistory = visitedIdsRef.current.slice(
        0,
        historyIndexRef.current + 1,
      );
      const nextHistory = [...baseHistory, nextId];
      setVisitedIds(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
      setSelectedId(nextId);
      visitedIdsRef.current = nextHistory;
      historyIndexRef.current = nextHistory.length - 1;
      selectedIdRef.current = nextId;
    } catch (error) {
      setFatalError(String(error));
    } finally {
      setIsNavigatingDoc(false);
    }
  }

  function onPreviousDoc() {
    if (historyIndexRef.current <= 0 || isNavigatingDoc) {
      return;
    }
    const prevIndex = historyIndexRef.current - 1;
    if (prevIndex < 0 || prevIndex >= visitedIdsRef.current.length) {
      return;
    }
    const previousId = visitedIdsRef.current[prevIndex];
    setHistoryIndex(prevIndex);
    setSelectedId(previousId);
    historyIndexRef.current = prevIndex;
    selectedIdRef.current = previousId;
  }

  useEffect(() => {
    const media = window.matchMedia("(min-width: 961px)");
    const apply = () => setIsDesktopViewport(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    visitedIdsRef.current = visitedIds;
  }, [visitedIds]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    let cancelled = false;
    async function initSelectedFile() {
      try {
        const params = new URLSearchParams(window.location.search);
        const requestedId = (params.get("id") ?? "").trim().toUpperCase();
        if (requestedId) {
          if (!cancelled) {
            setVisitedIds([requestedId]);
            setHistoryIndex(0);
            setSelectedId(requestedId);
            visitedIdsRef.current = [requestedId];
            historyIndexRef.current = 0;
            selectedIdRef.current = requestedId;
          }
          return;
        }

        const randomId = await loadRandomDeletedId([]);
        if (!cancelled && randomId) {
          setVisitedIds([randomId]);
          setHistoryIndex(0);
          setSelectedId(randomId);
          visitedIdsRef.current = [randomId];
          historyIndexRef.current = 0;
          selectedIdRef.current = randomId;
        }
      } catch (error) {
        if (!cancelled) {
          setFatalError(String(error));
        }
      }
    }
    void initSelectedFile();
    return () => {
      cancelled = true;
    };
  }, [loadRandomDeletedId]);

  useEffect(() => {
    let id = "";
    try {
      id = window.localStorage.getItem(VOTER_ID_KEY) ?? "";
      if (!id) {
        id =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
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
    if (!selectedId) {
      setUpvoteCount(0);
      setUserVoted(false);
      setDocumentUrl("");
      return;
    }
    let cancelled = false;
    async function loadUpvotes() {
      try {
        const state = await loadDeletedDocVoteState(selectedId, voterId);
        if (!cancelled) {
          setUpvoteCount(state.upvotes);
          setUserVoted(state.userVoted);
          setDocumentUrl(state.sourceUrl);
        }
      } catch {
        if (!cancelled) {
          setUpvoteCount(0);
          setUserVoted(false);
          setDocumentUrl("");
        }
      }
    }
    void loadUpvotes();
    return () => {
      cancelled = true;
    };
  }, [selectedId, voterId]);

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
  }, [setVisualZoom, useCanvasRenderer]);

  useEffect(() => {
    setPdfDoc(null);
    setPageCount(0);
    setFatalError(null);
    setIsPdfLoading(Boolean(selectedId));
    setPreferNativeFallback(false);
    setZoom(1);
    setRenderZoom(1);
    canvasRefs.current.clear();
    zoomRef.current = 1;
    syncVisualZoom(1);
    pushLog(`Selected debug file: ${selectedId}`);
  }, [pushLog, selectedId, syncVisualZoom]);

  useEffect(() => {
    if (!useCanvasRenderer || isDesktopViewport) {
      return;
    }
    if (!pdfSourceUrl) {
      return;
    }

    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(pdfSourceUrl);
    setFatalError(null);
    setIsPdfLoading(true);
    pushLog(`Loading PDF document: ${pdfSourceUrl}`);

    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          return;
        }
        const typed = doc as unknown as PdfJsDocument;
        setPdfDoc(typed);
        setPageCount(typed.numPages || 0);
        setPreferNativeFallback(false);
        setIsPdfLoading(false);
        pushLog(`PDF loaded: numPages=${typed.numPages || 0}`);
      })
      .catch((error) => {
        void (async () => {
          if (cancelled) {
            return;
          }
          const message = String(error);
          const probe = await diagnosePdfSource(pdfSourceUrl);
          if (cancelled) {
            return;
          }
          const combined = `${message} | ${probe}`;
          setFatalError(combined);
          setIsPdfLoading(false);
          pushLog(`PDF load failed: ${combined}`);
        })();
      });

    return () => {
      cancelled = true;
      try {
        loadingTask.destroy();
      } catch {
        // Ignore cleanup errors for debug page.
      }
    };
  }, [isDesktopViewport, pdfSourceUrl, pushLog, useCanvasRenderer]);

  useEffect(() => {
    if (!useCanvasRenderer || isDesktopViewport) {
      return;
    }
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
  }, [
    isDesktopViewport,
    pageWidth,
    pageCount,
    pdfDoc,
    pushLog,
    renderZoom,
    useCanvasRenderer,
  ]);

  return (
    <main className="deleted-debug-root deleted-browser-mobile-shell">
      <section className="panel detail-nav link-bar deleted-browser-desktop-only">
        <div className="deleted-browser-nav-left">
          <Link href="/" className="table-link">
            Back to Dashboard
          </Link>
          <Link href="/deleted-docs-top-upvoted" className="table-link">
            View Top Upvoted
          </Link>
        </div>
        <div className="deleted-browser-nav-right">
          <Link
            href="/deleted-docs-my-upvotes"
            className="table-link link-right"
          >
            View My Upvotes
          </Link>
          <Link href="/deleted-docs-bookmarks" className="table-link">
            View Bookmarks
          </Link>
        </div>
      </section>
      <div className="deleted-debug-topbar">
        <ShareButton
          className="deleted-debug-mobile-share-btn"
          disabled={!selectedId}
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
                disabled={
                  historyIndex <= 0 ||
                  isNavigatingDoc ||
                  isPdfLoading ||
                  !selectedId
                }
                onClick={onPreviousDoc}
              >
                Previous
              </button>
              <button
                type="button"
                className="deleted-debug-btn deleted-debug-btn-secondary"
                disabled={!selectedId || !voterId || userVoted || isVoting}
                onClick={() => void onUpvoteDoc()}
              >
                ▲ {upvoteCount}
              </button>
              <button
                type="button"
                className="deleted-debug-btn"
                disabled={isNavigatingDoc || isPdfLoading || !selectedId}
                onClick={() => void onNextDoc()}
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

      <div
        ref={wrapRef}
        className={`deleted-debug-pdf-scroll${useCanvasRenderer ? " deleted-debug-pdf-scroll-custom" : ""}`}
      >
        {useCanvasRenderer ? (
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
            {isPdfLoading && pageCount < 1 ? (
              <p className="deleted-debug-error">Loading PDF pages...</p>
            ) : null}
            {!isPdfLoading && pageCount < 1 && !fatalError ? (
              <button
                type="button"
                className="deleted-debug-btn deleted-debug-btn-secondary"
                onClick={() => setPreferNativeFallback(true)}
              >
                Open Native PDF
              </button>
            ) : null}
          </div>
        ) : desktopPdfSourceUrl ? (
          <object
            className="deleted-debug-native-viewer"
            data={desktopPdfSourceUrl}
            type="application/pdf"
            aria-label={selectedId ? `PDF ${selectedId}` : "PDF document"}
            onLoad={() => setIsPdfLoading(false)}
          >
            <p className="deleted-debug-error">
              Unable to open inline PDF.{" "}
              <a href={desktopPdfSourceUrl} target="_blank" rel="noreferrer">
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
