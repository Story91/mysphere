'use client';

import { useState } from 'react';

/**
 * Akcje udostepniania pod Askiem.
 *
 * Ten sam ksztalt co `SharePostActions` przy postach i z tych samych powodow -
 * dwa rozne paski udostepniania w jednym produkcie to dwie rozne odpowiedzi na
 * to samo pytanie.
 *
 * === DLACZEGO NATYWNY ARKUSZ, A NIE WLASNE OKIENKO Z IKONAMI ===
 * `navigator.share` otwiera systemowy arkusz - ten sam, ktorego czlowiek uzywa
 * w kazdej innej aplikacji, z jego wlasna lista zainstalowanych aplikacji.
 * Wlasne okienko z czterema logotypami jest gorsze na trzy sposoby naraz: nie
 * wie, co ten czlowiek ma zainstalowane, wymaga utrzymywania starzejacej sie
 * listy i wyglada obco na kazdym systemie.
 *
 * Na desktopie `navigator.share` zwykle nie istnieje - wtedy kopiujemy link,
 * bo tam i tak konczy sie kazde udostepnianie.
 *
 * === CO NIESIE TEKST UDOSTEPNIENIA ===
 * Kwote ZA ODPOWIEDZ, nie budzet. Czytajacy decyduje, czy warto siasc do
 * roboty, a nie ile autor ma lacznie. Ta sama zasada rzadzi tytulem strony
 * i najwiekszym drukiem w kompozytorze.
 */
export default function ShareAskActions({
  askId,
  perAnswer,
}: {
  askId: string;
  perAnswer: string;
}) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== 'undefined' ? `${window.location.origin}/ask/${askId}` : '';
  const text = `${perAnswer} for an answer. Questions with budgets on MySphere.`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // Potwierdzenie wraca samo do spoczynku. Bez tego przycisk zostaje na
      // zawsze w stanie "skopiowano" i drugie klikniecie nie daje sygnalu.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Schowek bywa zablokowany (brak HTTPS, odmowa uprawnien). Nie udajemy
      // sukcesu - przycisk po prostu nie zmienia napisu.
    }
  };

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Ask on MySphere', text, url });
        return;
      } catch {
        // Zamkniety arkusz to nie blad - czlowiek sie rozmyslil. Schodzimy
        // cicho do kopiowania, zamiast krzyczec o anulowanej akcji.
      }
    }
    void copy();
  };

  const button =
    'inline-flex items-center justify-center rounded-lg px-3.5 py-2 font-soft-display text-[12.5px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface';

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-soft-line pt-4">
      <button
        type="button"
        onClick={() => void share()}
        className={`${button} bg-soft-primary text-white`}
      >
        Share this ask
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        className={`${button} border border-soft-line bg-soft-surface text-soft-ink-muted hover:text-soft-ink`}
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
}
