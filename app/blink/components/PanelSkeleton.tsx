/**
 * Zastepczy panel na czas ladowania stosu Solany (dynamic import). Ma mniej
 * wiecej wymiary prawdziwego panelu, zeby karta nie skakala, gdy sie dociagnie.
 */
export default function PanelSkeleton({ composer = true }: { composer?: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <p className="sr-only" role="status">
        Loading Solana wallet…
      </p>
      {composer && <div className="h-[132px] rounded-2xl bg-soft-sunken motion-safe:animate-pulse" />}
      <div className="h-[52px] rounded-2xl bg-soft-sunken motion-safe:animate-pulse" />
      <div className="h-12 rounded-pill bg-soft-sunken motion-safe:animate-pulse" />
    </div>
  );
}
