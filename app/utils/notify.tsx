'use client';

import { toast } from 'react-hot-toast';

/**
 * Powiadomienia aplikacji - jeden styl dla wszystkiego.
 *
 * === CO ZASTEPUJE ===
 * Dotychczasowe toasty byly pelnymi plachtami koloru: zielona przy sukcesie,
 * czerwona przy bledzie, bialy tekst w srodku. Trzy problemy naraz:
 *  - plachta koloru krzyczy tak samo przy "polubiono post" i przy "transakcja
 *    odrzucona", wiec sila komunikatu nie ma zwiazku z jego waga,
 *  - bialy tekst na nasyconym tle czyta sie gorzej niz czarny na bieli,
 *  - czesc komunikatow byla po polsku, czesc po angielsku, a interfejs jest
 *    angielski.
 *
 * === JAK JEST TERAZ ===
 * Biala karta, czarny tekst, cienka kolorowa ramka i jedna ikona po lewej.
 * Kolor niesie WYLACZNIE ramka i ikona - czyli dokladnie tyle, ile trzeba,
 * zeby rozpoznac rodzaj komunikatu katem oka, i ani grama wiecej.
 *
 * Ikona i ramka mowia to samo dwoma kanalami naraz: kto nie odroznia zieleni
 * od czerwieni, widzi ptaszek albo krzyzyk.
 *
 * === CZASY ===
 * Blad zostaje dluzej niz sukces (5 s wobec 3 s). Sukces tylko potwierdza to,
 * co uzytkownik wlasnie zrobil i o czym wie; blad niesie informacje, ktorej
 * jeszcze nie ma, i czasem instrukcje.
 */

const BASE =
  'flex items-start gap-3 rounded-card bg-white px-4 py-3 text-[13.5px] font-soft ' +
  'text-soft-ink shadow-float border';

function Icon({ tone }: { tone: 'success' | 'error' | 'info' }) {
  if (tone === 'success') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-[1px] shrink-0">
        <circle cx="12" cy="12" r="10" fill="#16A34A" />
        <path d="M8 12.5l2.6 2.6L16 9.7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === 'error') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-[1px] shrink-0">
        <circle cx="12" cy="12" r="10" fill="#DC2626" />
        <path d="M9 9l6 6M15 9l-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-[1px] shrink-0">
      <circle cx="12" cy="12" r="10" fill="#7C6BDA" />
      <path d="M12 8h.01M11 12h1v4h1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BORDER = {
  success: 'border-[#16A34A]/45',
  error: 'border-[#DC2626]/45',
  info: 'border-soft-line',
} as const;

function show(tone: 'success' | 'error' | 'info', message: React.ReactNode, duration: number) {
  return toast.custom(
    (t) => (
      <div
        // `t.visible` przelacza wejscie i wyjscie. Wejscie z gory i lekkiego
        // zmniejszenia - nigdy od scale(0), bo nic w rzeczywistosci nie
        // pojawia sie z nicosci.
        className={`${BASE} ${BORDER[tone]} max-w-[380px] transition-[opacity,transform] duration-[--dur-dropdown] ease-out-strong ${
          t.visible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-[0.97] opacity-0'
        }`}
        role={tone === 'error' ? 'alert' : 'status'}
      >
        <Icon tone={tone} />
        <span className="leading-[1.45]">{message}</span>
      </div>
    ),
    { duration }
  );
}

export const notify = {
  /** Potwierdzenie tego, co uzytkownik wlasnie zrobil. Krotko. */
  success: (message: React.ReactNode) => show('success', message, 3000),
  /** Niesie informacje, ktorej uzytkownik jeszcze nie ma - zostaje dluzej. */
  error: (message: React.ReactNode) => show('error', message, 5000),
  /** Rzecz do wiadomosci, ani sukces, ani awaria. */
  info: (message: React.ReactNode) => show('info', message, 3500),
  /** Przekazuje id, zeby dalo sie podmienic ten sam toast po zakonczeniu. */
  loading: (message: string) => toast.loading(message),
  dismiss: (id?: string) => toast.dismiss(id),
};

export default notify;
