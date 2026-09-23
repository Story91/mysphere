/**
 * Rama stron /blink/*: jedna karta, w ktorej stoi post i panel pod nim - jak
 * ekran odpowiedzi w aplikacji spolecznosciowej. Bez wlasnego paska z marka:
 * nad strona stoi juz nawigacja aplikacji i drugi napis "MySphere" dublowal ja.
 *
 * Do 23.09.2026 panel wisial wysrodkowany w pionie na pustej stronie
 * (justify-center + min-h-screen). Na telefonie z X oznaczalo to skok ukladu
 * przy kazdym zaladowaniu i pusta polowe ekranu nad postem. Teraz tresc
 * zaczyna sie u gory.
 */

import type { ReactNode } from 'react';

// `title` zostaje w propsach dla wywolujacych, ale nie jest juz rysowany -
// tytul strony niesie <title> i karta posta.
export default function BlinkFrame({ children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-soft-bg font-soft text-soft-ink">
      <main className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-4 sm:pt-8">
        <div className="rounded-card border border-soft-line bg-soft-surface shadow-card">{children}</div>
      </main>
    </div>
  );
}
