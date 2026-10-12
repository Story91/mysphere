import type { Metadata } from 'next';

/**
 * Metadane podstrony RAZEM z tekstami do podgladu linku.
 *
 * === PO CO ===
 * Next laczy `openGraph` i `twitter` z rodzicem PLYTKO: podstrona, ktora
 * ustawia samo `title` i `description`, dziedziczy z app/layout.tsx caly
 * obiekt `openGraph`/`twitter` - czyli tytul i opis strony glownej. Do
 * 2026-10-12 tak wygladaly /perps, /startpad, /startpad/sphere/*, /b20 i /Docs:
 * na X pod kazda karta stal ten sam pasek o feedzie.
 *
 * A gdy podstrona juz ustawi `openGraph`, traci wszystko, czego nie wpisala
 * (`siteName`, `type`, `card`) - stad pelny komplet ponizej.
 *
 * OBRAZEK. Strona z wlasnym plikiem `opengraph-image` w TYM SAMYM segmencie
 * nie podaje `image` - plik wygrywa i Next dokleja go sam. Strona BEZ
 * wlasnego pliku musi podac `image` (adres karty rodzica): ustawione tu
 * `openGraph` zastepuje caly obiekt rodzica razem z obrazkiem odziedziczonym
 * z jego pliku. Zmierzone na dev serwerze 2026-10-12: /startpad/sphere/vesting
 * i /Docs/asks oddawaly HTML bez og:image.
 *
 * `socialTitle` - tekst paska na X. `<title>` dostaje znaczek marki
 * z szablonu w layoucie, pasek nie, wiec pasek ma nazwe wpisana wprost.
 */
export function pageMeta(input: { title: string; description: string; socialTitle?: string; image?: string }): Metadata {
  const socialTitle = input.socialTitle ?? `${input.title} · MySphere`;
  const images = input.image ? [{ url: input.image, width: 1200, height: 630 }] : undefined;
  return {
    title: input.title,
    description: input.description,
    openGraph: {
      type: 'website',
      siteName: 'MySphere',
      title: socialTitle,
      description: input.description,
      ...(images && { images }),
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: input.description,
      ...(images && { images }),
    },
  };
}
