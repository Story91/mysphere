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
 * zalozenie Aska przez agenta platnoscia x402 - sprawdzone jednym prawdziwym
 * przebiegiem, 0,01 USDG na Robinhood Chain, NIE USDC na Base - ORAZ, od
 * podpiecia kontraktu, escrow na Base mainnecie (approve + fund przed zapisem
 * do Firestore, app/asks/page.tsx). Rozstrzygniecie to jedna transakcja
 * resolve(), odbior to claim() - pelny cykl przeszedl dwa razy prawdziwym USDC
 * na Base Sepolii (scripts/askEscrowCycle.js), ale NIE z przegladarki i NIE na
 * mainnecie. NIE dziala i NIE WOLNO tego pisac: powiadomienie o wygranej (nic
 * nie mowi zwyciezcy, ze ma pieniadze - musi wejsc na /money) oraz odpowiadanie
 * bez wychodzenia z feedu (pas otwartych Askow nad postami JEST, ale przycisk
 * prowadzi na /asks i tam sie pisze).
 *
 * === KONTRAKT NA MAINNECIE MA ZERO PRZEJSC ===
 * eth_getLogs od bloku wdrozenia 49635587 nie zwraca ANI JEDNEGO zdarzenia,
 * a balanceOf(USDC) escrow wynosi zero. Sciezka jest napisana i osiagalna,
 * ale nikt jeszcze nie zablokowal tam ani centa. Opis strony ma prawo mowic,
 * ze autor MOZE zablokowac budzet - bo moze - i nie ma prawa sugerowac ruchu
 * ani kolejki. Kazde zdanie w rodzaju "budzety sa juz blokowane" bedzie tu
 * klamstwem dopoty, dopoki ta linijka stoi.
 *
 * TE DWIE PLATNOSCI TO NIE JEST TA SAMA PLATNOSC. x402 placi za ZALOZENIE
 * Aska (grosze, USDG, Robinhood). Escrow blokuje BUDZET Aska (USDC, Base).
 * Inny lancuch, inny token, inny cel - i Ask zalozony przez agenta ma na
 * sztywno `funding: 'on-resolve'`, czyli escrow nie ma wcale. Opis strony nie
 * moze ich zlepic w jedno zdanie.
 *
 * UWAGA NA JEDNO SLOWO: escrow jest WYBOREM autora, nie wlasnoscia kazdego
 * Aska. Opis nie moze wiec brzmiec "budzet jest zablokowany" - musi mowic, ze
 * autor moze go zablokowac. Ktory wariant obowiazuje, pisze kazda karta osobno
 * (pole `funding`).
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
  // === TO ZDANIE MA POKRYCIE W KODZIE. SPRAWDZAJ PRZY KAZDEJ ZMIANIE. ===
  //
  // Historia, zeby nikt tego nie cofnal: staly tu kiedys slowa "the author pays
  // only for the ones they accept" w czasach, gdy `acceptAnswer` i `resolveAsk`
  // nie mialy ANI JEDNEGO wywolania w repo. Opis obiecywal petle, ktorej nie
  // bylo. Zdanie zostalo wtedy sciete do samego zapieczetowania - jedynej
  // rzeczy, ktora naprawde dzialala.
  //
  // Teraz petla jest zamknieta i to zdanie znow moze mowic o platnosci:
  //   - POST /api/asks/[id]/accept  -> acceptAnswer (route.ts:244)
  //   - POST /api/asks/[id]/resolve -> resolveAsk   (route.ts:98)
  // Trasa przyjmujaca NIE wierzy w hash na slowo: `verifyBasePayment` patrzy
  // na lancuch i wymaga transferu USDC nie mniejszego niz stawka za odpowiedz,
  // na adres odpowiadajacego. Dlatego wolno napisac "pays".
  //
  // ESCROW JUZ WOLNO WYMIENIC, ALE TYLKO JAKO MOZLIWOSC. Kontrakt AskEscrow
  // jest podpiety (app/utils/asks/escrow.ts, adresy w deployments/), a sciezka
  // zakladania blokuje budzet PRZED zapisem dokumentu - wiec Ask z
  // funding: 'escrowed' naprawde ma pokrycie. Ale wariant 'on-resolve' zyje
  // dalej i przy nim nie ma zablokowane NIC. Dlatego zdanie mowi "can lock",
  // a nie "is locked": opis dotyczy wszystkich Askow naraz, a one nie sa
  // jednakowe. Nie zamieniaj tego na obietnice bezwarunkowa.
  //
  // === "SEALED" DOPIERO OD TEGO TYGODNIA MA POKRYCIE ===
  // To zdanie stalo tu, kiedy bylo NIEPRAWDZIWE, i nikt tego nie zauwazyl.
  // Tresc odpowiedzi lezala w `askAnswerContent` z regula `allow read: if
  // false`, ale na koncu firestore.rules stala regula `match /{document=**}
  // { allow read, write: if true; }`. Firestore przyznaje dostep, gdy pozwala
  // JAKAKOLWIEK pasujaca regula - wiec `if false` bylo dekoracja, a kazdy
  // czytal cudze odpowiedzi klienckim SDK. Regula ogolna zostala zawezona
  // (`hasOwnRules`) i sonda potwierdzila, ze kolekcja odmawia odczytu.
  // JESLI KTOS KIEDYS DOPISZE NOWA KOLEKCJE Z WLASNYMI REGULAMI I ZAPOMNI
  // DOPISAC JEJ DO `hasOwnRules`, TO ZDANIE ZNOWU STANIE SIE KLAMSTWEM,
  // a tutaj nie bedzie tego widac. Sprawdzaj regule, nie komentarz.
  'An Ask is a question with a budget, a number of seats and a deadline. Answers stay sealed: nobody can read what anyone else wrote before the author opens them. The author can lock the whole budget in an escrow contract up front, and every payout is recorded onchain next to the answer that earned it.';

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
