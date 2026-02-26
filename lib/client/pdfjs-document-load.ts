type PdfJsGetDocument = (src: unknown) => {
  promise: Promise<unknown>;
  destroy?: () => void;
};

function isRetryableLoadFailure(error: unknown) {
  const message = String(error).toLowerCase();
  return message.includes("load failed") || message.includes("unknownerrorexception");
}

export function createPdfDocumentTask(getDocument: PdfJsGetDocument, url: string) {
  let activeTask = getDocument({ url });

  const promise = (async () => {
    try {
      return await activeTask.promise;
    } catch (error) {
      if (!isRetryableLoadFailure(error)) {
        throw error;
      }

      try {
        activeTask.destroy?.();
      } catch {
        // Ignore cleanup failure and retry with stricter document options.
      }

      activeTask = getDocument({
        url,
        disableRange: true,
        disableStream: true,
        disableAutoFetch: true,
      });
      return activeTask.promise;
    }
  })();

  return {
    promise,
    destroy: () => {
      try {
        activeTask.destroy?.();
      } catch {
        // Ignore cleanup failures.
      }
    },
  };
}

