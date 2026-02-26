export function isMobileSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  const isIOS =
    /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) {
    return false;
  }

  const isWebKit = /WebKit/i.test(ua);
  const isAlternativeIOSBrowser = /(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(ua);
  return isWebKit && !isAlternativeIOSBrowser;
}
