"use client";

import { Check, Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Chrome's own "Install app" dialog when the phone offers it; otherwise the steps below the button apply. */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [justInstalled, setInstalled] = useState(false);
  // Opened from the home-screen icon: already installed.
  const standalone = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );
  const installed = justInstalled || standalone;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="space-y-3">
        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300">
          <Check className="size-4" /> Installed on this phone
        </p>
        <Button asChild size="lg" className="w-full bg-[#f8f4ee] text-[#231d18] hover:bg-white">
          <Link href="/dashboard">Open Threadline</Link>
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="lg"
      className="h-12 w-full max-w-xs bg-[#b4532a] text-base text-white hover:bg-[#9c4522]"
      disabled={!prompt}
      onClick={async () => {
        if (!prompt) return;
        await prompt.prompt();
        if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
        setPrompt(null);
      }}
    >
      <Download /> {prompt ? "Install app" : "Use Chrome’s menu: ⋮ → Install app"}
    </Button>
  );
}
