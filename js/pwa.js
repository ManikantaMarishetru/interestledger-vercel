// InterestLedger PWA helper — safe service-worker registration.

export function registerSW() {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Service workers need a secure context; file:// and plain http stakes
    // simply skip instead of throwing.
    const start = () => {
      try {
        const p = navigator.serviceWorker.register("sw.js");
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        // Offline-safe: app works without a worker.
      }
    };
    if (typeof document !== "undefined" && document.readyState === "complete") {
      start();
    } else if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("load", start, { once: true });
    } else {
      start();
    }
  } catch {
    // Never break the app if registration is unavailable.
  }
}
