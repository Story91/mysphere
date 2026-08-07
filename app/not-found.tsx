/**
 * Strona 404 dla calej aplikacji.
 *
 * DLACZEGO TU: to jest ekran, ktory oglada sie po kliknieciu w czyjs profil
 * publiczny pod nieistniejacym adresem - /u/[address] wola `notFound()`, wiec
 * ta strona jest czescia tej samej sciezki. Zostala czarna, kiedy reszta
 * produktu zrobila sie jasna, wiec bledny link wygladal jak wyjscie z aplikacji
 * do czegos zupelnie innego.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-soft-bg px-5 font-soft">
      <div className="w-full max-w-[420px] rounded-card bg-soft-surface p-10 text-center shadow-card">
        <p className="font-soft-display text-[52px] font-bold leading-none tabular-nums text-soft-primary">
          404
        </p>
        <h1 className="mb-2 mt-4 font-soft-display text-[20px] font-bold text-soft-ink">
          Page not found
        </h1>
        <p className="mb-7 font-soft text-[14px] leading-[1.6] text-soft-ink-muted">
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
        <a
          href="/"
          className="inline-block rounded-pill bg-soft-primary px-6 py-3 font-soft text-[14px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
        >
          Go home
        </a>
      </div>
    </main>
  );
}
