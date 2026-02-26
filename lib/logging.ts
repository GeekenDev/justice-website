type LogPayload = Record<string, unknown> | undefined;

function readClientVerboseFlag() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("verbose");
    if (fromQuery === "1" || fromQuery === "true") {
      return true;
    }
    const fromStorage = window.localStorage.getItem("verbose_logs");
    return fromStorage === "1" || fromStorage === "true";
  } catch {
    return false;
  }
}

export function isVerboseServerEnabled() {
  return (
    process.env.VERBOSE_LOGS === "1" ||
    process.env.NEXT_PUBLIC_VERBOSE_LOGS === "1"
  );
}

export function isVerboseClientEnabled() {
  return (
    process.env.NEXT_PUBLIC_VERBOSE_LOGS === "1" ||
    readClientVerboseFlag()
  );
}

export function logServerVerbose(scope: string, message: string, payload?: LogPayload) {
  if (!isVerboseServerEnabled()) {
    return;
  }
  if (payload) {
    console.log(`[verbose][${scope}] ${message}`, payload);
    return;
  }
  console.log(`[verbose][${scope}] ${message}`);
}

export function logClientVerbose(scope: string, message: string, payload?: LogPayload) {
  if (!isVerboseClientEnabled()) {
    return;
  }
  if (payload) {
    console.log(`[verbose][${scope}] ${message}`, payload);
    return;
  }
  console.log(`[verbose][${scope}] ${message}`);
}
