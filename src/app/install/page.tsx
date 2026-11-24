import { CheckCircle2, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RegisterServiceWorker } from "@/components/app/register-sw";
import { LogoMark } from "@/components/brand/logo-mark";
import { teamAppMetadata, teamAppViewport } from "@/lib/team-app";
import { InstallButton } from "./install-button";

export const metadata: Metadata = { title: "Install the team app", ...teamAppMetadata };
export const viewport = teamAppViewport;

const STEPS = [
  { title: "Open this page in Chrome", text: "Share this link on WhatsApp. If it opens inside WhatsApp, tap ⋮ and choose Open in Chrome." },
  { title: "Tap “Install app”", text: "Use the button above. No button? Tap Chrome’s ⋮ menu, then Install app or Add to Home screen." },
  { title: "Open Threadline from your home screen", text: "It opens full screen, without the browser bar. Sign in with your team email and password once." },
];

/** Shareable page that installs the team site as a phone app (Android Chrome; iPhone via Safari). */
export default function InstallPage() {
  return (
    <main className="min-h-svh bg-[#1c1612] px-4 py-10 text-[#f8f4ee]">
      <RegisterServiceWorker />
      <div className="mx-auto max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-[28px] bg-[#231d18] p-3 shadow-2xl ring-1 ring-white/10">
            <LogoMark size={88} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-[0.2em] text-[#e08a5f] uppercase">Threadline team</p>
            <h1 className="font-display text-3xl tracking-tight">Install the app on your phone</h1>
            <p className="text-sm text-[#f8f4ee]/70">Products, Sold, stock, sales, expenses and orders: the full workspace, full screen, one tap from your home screen.</p>
          </div>
          <InstallButton />
        </div>

        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#b4532a] text-sm font-semibold">{i + 1}</span>
              <div className="space-y-1">
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-[#f8f4ee]/70">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <ul className="space-y-2 text-sm text-[#f8f4ee]/70">
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#e08a5f]" /> Updates arrive by themselves: nothing to reinstall.
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#e08a5f]" /> Needs the internet, like the website.
          </li>
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-[#e08a5f]" /> iPhone: open in Safari, tap Share, then Add to Home Screen.
          </li>
        </ul>

        <p className="text-center text-sm">
          <Link href="/login" className="text-[#f8f4ee]/80 underline-offset-4 hover:underline">
            Open in the browser instead
          </Link>
        </p>
      </div>
    </main>
  );
}
