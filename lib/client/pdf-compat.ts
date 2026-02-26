export function applyPdfCompatPolyfills() {
  // Safari compatibility for PDF.js runtime requirements.
  if (typeof globalThis !== "object" || globalThis === null) {
    return;
  }
  const g = globalThis as Record<string, unknown>;

  try {
    if (typeof g.DOMMatrix === "undefined") {
      const webkitMatrix = g.WebKitCSSMatrix;
      if (typeof webkitMatrix !== "undefined") {
        g.DOMMatrix = webkitMatrix;
      }
    }
  } catch {
    // Ignore non-fatal polyfill failures.
  }

  try {
    if (!(Promise as { withResolvers?: unknown }).withResolvers) {
      const withResolvers = function withResolvers() {
        let resolve!: (value: unknown) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<unknown>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      };
      Object.defineProperty(Promise, "withResolvers", {
        configurable: true,
        writable: true,
        value: withResolvers,
      });
    }
  } catch {
    // Ignore non-fatal polyfill failures.
  }
}
