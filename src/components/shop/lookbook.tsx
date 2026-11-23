/** Three slowly drifting columns of shop photos, tilted like a lookbook wall (still for reduced motion). */
export function Lookbook({ photos, className = "" }: { photos: string[]; className?: string }) {
  const cols = [0, 1, 2].map((c) => photos.filter((_, i) => i % 3 === c));
  return (
    <div aria-hidden className={`pointer-events-none absolute flex rotate-[-8deg] gap-4 ${className}`}>
      {cols.map((col, c) => (
        <div key={c} className="flex-1 overflow-hidden">
          {/* Doubled so the loop is seamless */}
          <div className={`flex flex-col gap-4 ${c % 2 ? "lookbook-down" : "lookbook-up"}`}>
            {[...col, ...col].map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- CDN or local storage URL
              <img key={i} src={src} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
