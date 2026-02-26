"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { logClientVerbose } from "@/lib/logging";
import { loadPdfJsModule } from "@/lib/client/load-pdfjs";
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
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel?: () => void };
};

export default function DocumentViewerClient({ eftaId }: DocumentViewerClientProps) {
  const [pdfjs, setPdfjs] = useState<null | {
    getDocument: (src: unknown) => { promise: Promise<unknown>; destroy?: () => void };
  }>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [rendererInitError, setRendererInitError] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageRendering, setPageRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const metadataUrl = useMemo(() => `/api/file/${encodeURIComponent(eftaId)}`, [eftaId]);

  useEffect(() => {
    setPageCount(0);
    setPage(1);
    setPdfLoadError(null);
    setPdfDoc(null);
    setSourceUrl("");
    logClientVerbose("documents/viewer", "Document changed; reset viewer state", {
      eftaId,
      metadataUrl,
    });
  }, [eftaId, metadataUrl]);

  useEffect(() => {
    let isCancelled = false;

    async function loadSourceUrl() {
      try {
        const response = await fetch(metadataUrl);
        const payload = (await response.json()) as {
          file?: { sources?: { original_link?: string | null; doj_link?: string | null } };
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
    let isMounted = true;

    async function initPdfjs() {
      try {
        logClientVerbose("documents/viewer", "Initializing custom pdfjs renderer", { eftaId });
        const loaded = await loadPdfJsModule();
        if (!isMounted) {
          return;
        }
        setPdfjs({
          getDocument: loaded.pdfjs.getDocument,
        });
        setRendererFailed(false);
        setRendererInitError(null);
        logClientVerbose("documents/viewer", "pdfjs initialized", {
          eftaId,
          version: loaded.version,
          worker: loaded.workerSrc,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setRendererFailed(true);
        setRendererInitError(String(error));
        logClientVerbose("documents/viewer", "pdfjs init failed", {
          eftaId,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    void initPdfjs();
    return () => {
      isMounted = false;
    };
  }, [eftaId]);

  useEffect(() => {
    if (!pdfjs || !sourceUrl) {
      return;
    }

    let isCancelled = false;
    const task = createPdfDocumentTask(pdfjs.getDocument, sourceUrl);

    task.promise
      .then((doc) => {
        if (isCancelled) {
          return;
        }
        const typedDoc = doc as unknown as PdfJsDocument;
        setPdfDoc(typedDoc);
        setPageCount(typedDoc.numPages || 0);
        setPage((prev) => Math.min(Math.max(1, prev), typedDoc.numPages || 1));
        setPdfLoadError(null);
        logClientVerbose("documents/viewer", "PDF loaded", {
          eftaId,
          sourceUrl,
          numPages: typedDoc.numPages,
        });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        setPdfLoadError(String(error));
        logClientVerbose("documents/viewer", "PDF load failed", {
          eftaId,
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
        // Ignore cleanup errors.
      }
    };
  }, [eftaId, pdfjs, sourceUrl]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || pageCount < 1) {
      return;
    }
    const doc = pdfDoc;

    let isCancelled = false;
    let renderTask: { promise: Promise<void>; cancel?: () => void } | null = null;
    setPageRendering(true);

    async function renderPage() {
      try {
        const pageProxy = await doc.getPage(page);
        if (isCancelled || !canvasRef.current) {
          return;
        }
        const viewport = pageProxy.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not get 2d canvas context");
        }
        renderTask = pageProxy.render({
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
        if (!isCancelled) {
          logClientVerbose("documents/viewer", "Rendered page", {
            eftaId,
            page,
            zoom,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
          });
        }
      } catch (error) {
        if (!isCancelled) {
          setPdfLoadError(String(error));
          logClientVerbose("documents/viewer", "Page render failed", {
            eftaId,
            page,
            zoom,
            error: String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      } finally {
        if (!isCancelled) {
          setPageRendering(false);
        }
      }
    }

    void renderPage();
    return () => {
      isCancelled = true;
      try {
        renderTask?.cancel?.();
      } catch {
        // Ignore cancellation errors.
      }
    };
  }, [eftaId, page, pageCount, pdfDoc, zoom]);

  function onNext() {
    setPage((prev) => Math.min(pageCount || prev, prev + 1));
  }

  function onPrevious() {
    setPage((prev) => Math.max(1, prev - 1));
  }

  function onZoomIn() {
    setZoom((prev) => Math.min(3, Number((prev + 0.15).toFixed(2))));
  }

  function onZoomOut() {
    setZoom((prev) => Math.max(0.5, Number((prev - 0.15).toFixed(2))));
  }

  return (
    <main className="app-shell">
      <div className="glow glow-left" />
      <div className="glow glow-right" />

      <section className="hero">
        <p className="eyebrow">Document Viewer</p>
        <h1 className="mono">{eftaId}</h1>
        <p className="subtitle">Dedicated PDF.js canvas viewer with page and zoom controls.</p>
      </section>

      <section className="panel detail-nav link-bar">
        <button type="button" onClick={() => window.history.back()}>
          Back
        </button>
        <Link href={`/file/${encodeURIComponent(eftaId)}`} className="table-link">
          File Details
        </Link>
        <a href={sourceUrl || "#"} download={`${eftaId}.pdf`} className="table-link">
          Download PDF
        </a>
      </section>

      <section className="panel document-viewer-panel">
        <header className="document-viewer-controls">
          <button type="button" onClick={onPrevious} disabled={page <= 1 || pageRendering}>
            Previous Page
          </button>
          <p className="mono">
            Page {page} / {pageCount || "-"}
          </p>
          <button type="button" onClick={onNext} disabled={pageCount === 0 || page >= pageCount || pageRendering}>
            Next Page
          </button>
          <button type="button" onClick={onZoomOut} disabled={pageRendering}>
            -
          </button>
          <p className="mono">{Math.round(zoom * 100)}%</p>
          <button type="button" onClick={onZoomIn} disabled={pageRendering}>
            +
          </button>
        </header>

        <div className="document-viewer-scroll">
          {rendererFailed ? (
            <p className="empty">Custom PDF renderer failed to initialize.</p>
          ) : null}
          {rendererInitError ? <p className="empty mono">Renderer init error: {rendererInitError}</p> : null}
          {pdfLoadError ? <p className="empty mono">PDF load error: {pdfLoadError}</p> : null}
          {!rendererFailed && !pdfLoadError ? (
            <div className="document-viewer-page">
              <canvas ref={canvasRef} />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
