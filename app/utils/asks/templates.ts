import { ASK_DURATIONS, MIN_PER_ANSWER } from './types';

/**
 * Gotowe zaczatki Askow.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Ask jest pusty jak kartka i to jest jego najwiekszy problem. Czlowiek, ktory
 * pierwszy raz widzi pole "What do you need judged?", nie wie trzech rzeczy
 * naraz: o co wolno zapytac, ile to kosztuje i jak dlugo sie czeka. Kazda
 * z nich osobno jest do wybaczenia, wszystkie trzy razem konczy sie zamknieciem
 * kompozytora.
 *
 * Zaczatek odpowiada na cala trojke jednym klliknieciem, bo niesie nie tylko
 * tresc, ale i budzet, miejsca oraz termin. To jest jego cala robota.
 *
 * ===========================================================================
 * DLACZEGO AKURAT ANALIZA ONCHAIN, A NIE "DOWOLNE PYTANIA"
 * ===========================================================================
 * Badanie protokolu Morpho (5 mld USD depozytow na Base) skonczylo sie
 * wnioskiem, ktory brzmi banalnie, a nie jest: pokazywanie CUDZYCH POZYCJI
 * w feedzie to DeBank z komentarzami - cudza dana, nasz gorszy interfejs.
 * Natomiast SPRZEDAWANIE PRACY o tych protokolach nie ma tam konkurencji,
 * bo tracker portfela nie sprzedaje analizy.
 *
 * Dlatego zaczatki celuja w prace, ktora ktos naprawde zleca i za ktora
 * naprawde placi: przeczytaj to za mnie, znajdz w tym dziure, powiedz mi,
 * czego nie widze. Zadne z tych pytan nie wymaga od nas integracji z czymkolwiek
 * - odpowiada czlowiek, nie protokol.
 *
 * ===========================================================================
 * CZEGO TU NIE MA I DLACZEGO
 * ===========================================================================
 * Nie ma zaczatka, ktory obiecuje ODPOWIADAJACEGO. Zaden z tych tekstow nie
 * mowi "nasi analitycy odpowiedza" ani nie sugeruje, ze po drugiej stronie
 * ktos czeka. Ask z budzetem jest oferta pracy, a nie zamowieniem w sklepie -
 * i jesli nikt jej nie podejmie, pieniadze wracaja. Produkt, ktory chwali sie
 * podaza, ktorej nie ma, klamie przy pierwszym uzyciu.
 */

const HOUR = 60 * 60 * 1000;

/** Termin po etykiecie, zeby zaczatek nie powtarzal liczb z `ASK_DURATIONS`. */
function duration(label: (typeof ASK_DURATIONS)[number]['label']): number {
  const found = ASK_DURATIONS.find((item) => item.label === label);
  // Nie da sie tu trafic przy poprawnym typie, ale zaczatek bez terminu jest
  // grozniejszy niz zaczatek z domyslna doba - wiec zapasowa wartosc, nie rzut.
  return found ? found.ms : 24 * HOUR;
}

export type AskTemplate = {
  id: string;
  /** Napis na pigulce. Rzeczownik, nie zdanie - to etykieta, nie zachęta. */
  chip: string;
  /**
   * Tresc wstawiana do pola. Nawiasy ostre sa CELOWE: zaczatek ma zostac
   * dokonczony, a nie wyslany jak stoi. Pytanie bez konkretu ("przeanalizuj
   * jakis vault") nie da sie rozstrzygnac, wiec i tak spalilo by budzet.
   *
   * TRZY Z NICH DOKONCZA SIE SAME, gdy ktos wybierze skarbiec z listy
   * w kompozytorze: `<vault address>`, `<market or vault>` i `<APY>`. Robi to
   * `attachVaultContext` w ./vaultContext.ts - i gdy zmieniasz tu ten napis,
   * zmien go rowniez tam, bo dopasowanie jest doslowne.
   */
  question: string;
  budget: number;
  seats: number;
  durationMs: number;
};

/**
 * Kolejnosc jest kolejnoscia progu wejscia, nie waznosci: pierwsze sa te,
 * ktore da sie zadac, majac wylacznie adres, ostatnie te, ktore wymagaja
 * wlasnej tezy. Ktos, kto klika pierwszy raz, trafia na najlatwiejsze.
 */
export const ASK_TEMPLATES: AskTemplate[] = [
  {
    id: 'vault-risk',
    chip: 'Vault risk',
    question:
      'Read this Morpho vault and tell me what breaks it: <vault address>. I want the collateral mix, which oracle it trusts, and the one scenario that actually costs me money.',
    budget: 12,
    seats: 2,
    durationMs: duration('3 days'),
  },
  {
    id: 'real-yield',
    chip: 'Is this yield real',
    question:
      'This market shows <APY> on <market or vault>. Split it for me: how much is borrower interest and how much is incentives, and what is left when the incentives stop?',
    budget: 6,
    seats: 2,
    durationMs: duration('24 hours'),
  },
  {
    id: 'contract-powers',
    chip: 'What can the owner do',
    question:
      'Contract <address> on <chain>. In plain English, list every power the owner or admin keeps: what can they change, how fast, and what would I see before it happens.',
    budget: 8,
    seats: 2,
    durationMs: duration('24 hours'),
  },
  {
    id: 'kill-my-thesis',
    chip: 'Kill my thesis',
    question:
      'My thesis: <write it in two sentences>. Argue the other side with evidence I can check — onchain data, docs, or a transaction. Vibes do not count.',
    budget: 5,
    seats: 3,
    durationMs: duration('24 hours'),
  },
  {
    id: 'second-opinion',
    chip: 'Second opinion',
    question:
      'I am about to <the decision>. Before I do: what am I not seeing? One concrete risk per answer, with the reason you think it applies to me.',
    budget: 4,
    seats: 2,
    durationMs: duration('6 hours'),
  },
];

/**
 * Straznik przeciw zaczatkowi, ktorego formularz i tak by nie przyjal.
 *
 * `AskComposer` odrzuca stawke ponizej `MIN_PER_ANSWER`, wiec zaczatek z za
 * malym budzetem wstawilby sie i NATYCHMIAST pokazal blad - czyli pigulka
 * podpowiadajaca zle dane. Zamiast tego taki zaczatek po prostu nie istnieje.
 *
 * Sprawdzane przy imporcie, a nie w tescie: ta lista jest edytowana recznie
 * i pomylka o jedno zero jest tu najbardziej prawdopodobnym bledem.
 */
export const ASK_TEMPLATES_SAFE: AskTemplate[] = ASK_TEMPLATES.filter(
  (template) => template.seats >= 1 && template.budget / template.seats >= MIN_PER_ANSWER
);
