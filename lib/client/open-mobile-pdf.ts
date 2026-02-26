type RestoreState = {
  key: string;
  value: unknown;
};

export function openMobilePdfPreservingPage(url: string, restoreState?: RestoreState) {
  if (restoreState) {
    try {
      window.sessionStorage.setItem(restoreState.key, JSON.stringify(restoreState.value));
    } catch {
      // Non-blocking.
    }
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) {
    return;
  }
  window.location.assign(url);
}
