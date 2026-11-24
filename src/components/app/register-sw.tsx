"use client";

import { useEffect } from "react";

/** Registers the team app's service worker (offline screen; needed for "Install app"). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
