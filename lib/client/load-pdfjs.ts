import { applyPdfCompatPolyfills } from "@/lib/client/pdf-compat";

type PdfJsModule = {
  version: string;
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: unknown) => { promise: Promise<unknown>; destroy?: () => void };
};

type LoadedPdfJsModule = {
  pdfjs: PdfJsModule;
  version: string;
  workerSrc: string;
};

let pdfJsModulePromise: Promise<LoadedPdfJsModule> | null = null;

export async function loadPdfJsModule(): Promise<LoadedPdfJsModule> {
  if (pdfJsModulePromise) {
    return pdfJsModulePromise;
  }

  pdfJsModulePromise = (async () => {
    applyPdfCompatPolyfills();

    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf")) as unknown as PdfJsModule;
    const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

    return {
      pdfjs,
      version: pdfjs.version,
      workerSrc,
    };
  })();

  return pdfJsModulePromise;
}
