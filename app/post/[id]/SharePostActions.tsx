'use client';

import { useState } from 'react';

/**
 * Akcje udostepniania pod postem.
 *
 * === DLACZEGO TO JEST OSOBNY KOMPONENT KLIENCKI ===
 * Schowek i natywny arkusz udostepniania istnieja tylko w przegladarce. Gdyby
 * cala strona byla kliencka, crawler i podglad linku dostawalyby pusty dokument
 * - a ta strona istnieje WYLACZNIE po to, zeby dobrze wygladac po wklejeniu.
 * Wiec serwerowa zostaje tresc, a kliencki jest tylko ten pasek.
 *
 * === DLACZEGO NATYWNY ARKUSZ, A NIE WLASNE OKIENKO ===
 * `navigator.share` otwiera systemowy arkusz - ten sam, ktorego uzytkownik uzywa
 * w kazdej innej aplikacji na swoim telefonie, z jego wlasna lista aplikacji.
 * Wlasne okienko z czterema ikonami sieci spolecznosciowych jest gorsze na trzy
 * sposoby naraz: nie zna aplikacji, ktore ten czlowiek ma zainstalowane, wymaga
 * utrzymywania listy, ktora sie starzeje, i wyglada obco na kazdym systemie.
 *
 * Na desktopie `navigator.share` zwykle nie istnieje - wtedy kopiujemy link do
 * schowka, bo tam i tak konczy sie kazde udostepnianie.
 */

export default function SharePostActions({
  postId,
  authorName,
}: {
  postId: string;
  authorName: string;
}) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== 'undefined' ? `${window.location.origin}/post/${postId}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // Potwierdzenie wraca do stanu spoczynku samo. Bez tego przycisk zostaje
      // na zawsze w stanie "skopiowano" i przy drugim klikniÄ™ciu nie daje
      // zadnego sygnalu, ze cokolwiek sie stalo.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Schowek bywa zablokowany (brak HTTPS, odmowa uprawnien). Zaznaczamy
      // adres, zeby dalo sie go skopiowac recznie - zamiast udawac, ze nic sie
      // nie stalo.
      window.prompt('Copy this link', url);
    }
  };

  const share = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${authorName} on MySphere`, url });
        return;
      } catch {
        // Zamkniecie arkusza przez uzytkownika to NIE jest blad - nie
        // pokazujemy niczego i nie probujemy niczego naprawiac.
        return;
      }
    }
    void copy();
  };

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="mt-4 flex flex-wrap gap-2.5">
      <button
        type="button"
        onClick={share}
        className="flex items-center gap-2 rounded-pill bg-soft-primary px-5 py-3 font-soft text-[13.5px] font-bold text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />
        </svg>
        {hasNativeShare ? 'Share' : 'Copy link'}
      </button>

      {hasNativeShare && (
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="flex items-center gap-2 rounded-pill bg-soft-surface px-5 py-3 font-soft text-[13.5px] font-semibold text-soft-ink-muted shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 012-2h10" />
            </svg>
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      )}
    </div>
  );
}
