import type { Metadata } from 'next';

/**
 * Layout istnieje WYLACZNIE po to, zeby /asks mialo wlasne metadane.
 *
 * app/asks/page.tsx jest komponentem klienckim ('use client', bo czyta
 * Firestore tym samym SDK co feed), a komponent kliencki nie moze wyeksportowac
 * `metadata`. Do tej pory strona dziedziczyla wiec opis calego serwisu -
 * podglad linku do listy Askow mowil o napiwkach, czyli o czym innym.
 *
 * === CO TU MOZNA OBIECAC, A CZEGO NIE ===
 * Dziala: lista otwartych Askow z Firestore, wskaznik rozstrzygalnosci autora,
 * zalozenie Aska przez agenta platnoscia x402. NIE dziala i NIE WOLNO tego
 * pisac: Ask w feedzie ani escrow na mainnecie. Kontrakt AskEscrow stoi na
 * Base Sepolia i nic przez niego nie plynie, wiec opis mowi dokladnie to samo,
 * co naglowek strony: budzet nie jest blokowany z gory, autor placi przy
 * rozstrzygnieciu.
 *
 * Tytul to samo "Open asks" - marke doklada `title.template` z layoutu
 * glownego, wiec w karcie wyjdzie "Open asks · MySphere". Obrazek dziedziczy
 * z app/opengraph-image.tsx: karta z teza produktu jest tu wlasciwa, bo Ask
 * jest tym samym argumentem co napiwek - pieniadzmi zamiast punktow.
 *
 * Bez `alternates.canonical` z tego samego powodu, dla ktorego nie ma go
 * w layoucie glownym, plus jeden lokalny: projekt ma `trailingSlash: true`,
 * wiec recznie wpisany canonical bez slasha rozjechalby sie z adresem, ktory
 * serwis faktycznie serwuje.
 */

const ASKS_DESCRIPTION =
  'An Ask is a question with a budget, a number of seats and a deadline. Answers stay sealed until the author resolves, and the author pays only for the ones they accept.';

export const metadata: Metadata = {
  title: 'Open asks',
  description: ASKS_DESCRIPTION,
  openGraph: {
    type: 'website',
    title: 'Open asks on MySphere',
    description: ASKS_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Open asks on MySphere',
    description: ASKS_DESCRIPTION,
  },
};

export default function AsksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
