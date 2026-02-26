import { useEffect } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf";

export default function PDFViewer({ fileUrl }: { fileUrl: string }) {
  useEffect(() => {
    // 👇 SET WORKER PATH HERE
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

    const loadPdf = async () => {
      const loadingTask = pdfjs.getDocument(fileUrl);
      const pdf = await loadingTask.promise;

      console.log("Pages:", pdf.numPages);
    };

    loadPdf();
  }, [fileUrl]);
}
