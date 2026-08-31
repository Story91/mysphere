/**
 * Kolorowanie koncowki nazwy uzytkownika: `story91` + `.sphere`.
 *
 * === PO CO OSOBNY PLIK ===
 * Koncowka mowi, z ktorej sieci pochodzi nazwa, i to jedyna informacja o
 * przynaleznosci, jaka niesie sam napis. Do tej pory kolorowaly ja RECZNIE
 * wpisane pary `replace('.sphere','')` + `<span className="text-blue-500">`,
 * rozsypane po czterech miejscach - i w kazdym z nich obslugiwaly tylko
 * `.sphere` i `.camper`, w dodatku w roznych kolorach (`text-blue-500`
 * w jednym pliku, `text-soft-primary-deep` w drugim).
 *
 * Skutek: `.celo` i `.world` mozna bylo ZALOZYC w profilu i dostac za nie
 * punkty (1250 kazda, patrz DOMAIN_BONUSES w firebase.ts), ale nigdzie nie
 * dostawaly wlasnego koloru - wygladaly jak zwykly tekst. To ta sama klasa
 * bledu co trzy kopie adresu admina: jedna rzecz opisana w kilku miejscach
 * rozjezdza sie przy pierwszej zmianie.
 *
 * === DOBOR KOLOROW ===
 * Barwy marek wziete z NETWORKS (TipNetworkConfig.ts), ale PRZYCIEMNIONE tam,
 * gdzie oryginal jest nieczytelny na bialym tle. Celo ma w marce #FCFF52 -
 * zolty na bialym to praktycznie brak tekstu, wiec idzie ciemna zielen Celo.
 * World Chain ma #000000, co na bialym jest czytelne, ale nie do odroznienia
 * od reszty napisu - stad grafit zamiast czerni.
 *
 * Kolejnosc w tablicy ma znaczenie: `.base.eth` musi byc sprawdzone PRZED
 * `.eth`, inaczej dluzsza koncowka nigdy nie trafi.
 */

export type NameSuffix = {
  suffix: string;
  /** Kolor koncowki. Hex, bo to barwa marki, a nie token interfejsu. */
  color: string;
  label: string;
};

export const NAME_SUFFIXES: NameSuffix[] = [
  { suffix: '.base.eth', color: '#0052FF', label: 'BaseName' },
  { suffix: '.sphere', color: '#7C6BDA', label: 'MySphere' },
  { suffix: '.camper', color: '#D2551F', label: 'Camp' },
  { suffix: '.celo', color: '#2F7D4F', label: 'Celo' },
  { suffix: '.world', color: '#3F3F46', label: 'World Chain' },
];

/** Rozbija nazwe na czesc wlasna i rozpoznana koncowke. */
export function splitName(name: string): { base: string; suffix: NameSuffix | null } {
  if (!name) return { base: '', suffix: null };
  const hit = NAME_SUFFIXES.find((entry) => name.toLowerCase().endsWith(entry.suffix));
  if (!hit) return { base: name, suffix: null };
  return { base: name.slice(0, name.length - hit.suffix.length), suffix: hit };
}

/**
 * Nazwa z pokolorowana koncowka.
 *
 * `className` opisuje CZESC WLASNA nazwy - koncowka zawsze dostaje kolor
 * swojej sieci, wiec nie da sie jej przypadkiem wyszarzyc razem z reszta.
 */
export function NameWithSuffix({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  const { base, suffix } = splitName(name);

  if (!suffix) return <span className={className}>{name}</span>;

  return (
    <span className={className}>
      {base}
      <span style={{ color: suffix.color }} title={suffix.label}>
        {suffix.suffix}
      </span>
    </span>
  );
}
