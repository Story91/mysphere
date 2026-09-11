/**
 * Obrazki tokenow: skad je bierzemy i dlaczego akurat stamtad.
 *
 * ===========================================================================
 * ERC-20 NIE MA LOGO. TO NIE JEST NASZE NIEDOPATRZENIE - TAK WYGLADA STANDARD
 * ===========================================================================
 * Kontrakt tokena zna `name`, `symbol` i `decimals`. Nic wiecej. Zaden portfel
 * nie czyta naszego `metadataURI`, bo nie ma powodu wiedziec, ze on istnieje.
 *
 * Logo pojawia sie w portfelach z INNYCH zrodel:
 *   - token lists w standardzie Uniswapa (my wystawiamy swoja pod
 *     /api/launchpad/tokenlist);
 *   - repozytoria assetow portfeli i agregatorow;
 *   - osobne zgloszenie w eksploratorze bloku.
 *
 * Dlatego obrazek trzymamy w postaci, ktora da sie podac dalej KAZDEMU z tych
 * odbiorcow, zamiast liczyc na to, ze ktos zajrzy do naszego kontraktu.
 *
 * ===========================================================================
 * DLACZEGO IPFS, A NIE ZWYKLY URL
 * ===========================================================================
 * Adres `ipfs://<cid>` jest adresem TRESCI - cid to skrot pliku. Kto poda inny
 * plik, dostanie inny cid, wiec logo nie da sie po cichu podmienic po starcie.
 * Przy `https://` obrazek moze podmienic wlasciciel serwera, ktory nie musi byc
 * tworca tokena - i nikt tego nie zauwazy.
 *
 * Cena IPFS jest realna i trzeba ja nazwac: tresc zyje, dopoki ktos ja pinuje.
 * Dlatego `https://` NIE jest zakazane - jest gorsza, ale dzialajaca opcja dla
 * kogos, kto nie ma czym pinowac.
 */

/**
 * Brama IPFS. Zmienna srodowiskowa, bo bramy padaja i limituja ruch, a przy
 * takim zdarzeniu chcemy zmienic jedna wartosc, a nie deployowac kod.
 */
const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/';

/**
 * Zamienia `ipfs://` na adres przez brame. Wszystko inne przepuszcza tylko
 * wtedy, gdy jest bezpieczne do wstawienia w `src` albo `href`.
 *
 * `javascript:` i `data:` odpadaja tutaj, a nie w komponencie. Sprawdzenie w
 * jednym miejscu jest pewniejsze niz pamietanie o nim w kazdym widoku - a ten
 * string pochodzi od obcego tworcy i trafia prosto do DOM-u.
 */
/**
 * data: przepuszczamy WYLACZNIE dla obrazkow rastrowych z base64. SVG celowo
 * odpada - to XML ze skryptami i w innych kontekstach niz <img> umie je
 * wykonac; raster nie ma czego wykonywac. To jest kanal "logo z uploadu",
 * ktore zyje tylko w naszym Firestore i tylko na naszej stronie.
 */
const DATA_IMAGE_PREFIX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

export function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (trimmed.startsWith('ipfs://')) {
    const path = trimmed.slice('ipfs://'.length).replace(/^ipfs\//, '');
    if (path === '') return null;
    return `${IPFS_GATEWAY}${path}`;
  }

  if (DATA_IMAGE_PREFIX.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

export type TokenMetadata = {
  image: string | null;
  description: string | null;
  /** URI, ktorego nie umiemy rozpakowac - pokazujemy jako odnosnik, nie udajemy. */
  link: string | null;
  /**
   * Indeks, z ktorym tworca SPAROWAL token przy starcie (tylko Arc): symbol
   * po stronie Pytha ("AAPL/USD") i adres adaptera feedu. To deklaracja w
   * niezmiennych metadanych, nie dowod istnienia rynku - rynek sprawdza sie
   * osobno po adresie feedu (usePairedMarket w module derywatow).
   */
  pairedIndex: { symbol: string; feed: string } | null;
};

const DATA_JSON_PREFIX = 'data:application/json;base64,';

function decodeBase64(value: string): string | null {
  try {
    if (typeof atob === 'function') return atob(value);
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Rozpakowuje `metadataURI` z lancucha.
 *
 * Obslugujemy dwa ksztalty, ktore sami tworzymy albo widujemy:
 *   - `data:application/json;base64,...` - z naszego formularza, bez backendu;
 *   - `ipfs://` i `https://` - JSON lezy poza lancuchem i musi go pobrac ten,
 *     kto tego potrzebuje (my robimy to po stronie serwera, patrz tokenlist).
 *
 * Czego NIE robimy: nie pobieramy tu niczego sieciowo. Ta funkcja jest czysta,
 * zeby dalo sie jej uzyc w renderze bez zawieszania widoku na cudzej bramie.
 */
/** Symbol do 16 znakow z bezpiecznego alfabetu i adres 0x... - reszta odpada. */
function parsePairedIndex(value: unknown): TokenMetadata['pairedIndex'] {
  if (!value || typeof value !== 'object') return null;
  const { symbol, feed } = value as { symbol?: unknown; feed?: unknown };
  if (typeof symbol !== 'string' || typeof feed !== 'string') return null;
  if (!/^[A-Za-z0-9./ -]{1,16}$/.test(symbol) || !/^0x[0-9a-fA-F]{40}$/.test(feed)) return null;
  return { symbol, feed };
}

export function parseMetadataUri(uri: string | null | undefined): TokenMetadata {
  const empty: TokenMetadata = { image: null, description: null, link: null, pairedIndex: null };
  if (!uri) return empty;
  const trimmed = uri.trim();
  if (trimmed === '') return empty;

  if (!trimmed.startsWith(DATA_JSON_PREFIX)) {
    return { image: null, description: null, link: resolveMediaUrl(trimmed), pairedIndex: null };
  }

  const decoded = decodeBase64(trimmed.slice(DATA_JSON_PREFIX.length));
  if (decoded === null) return empty;

  try {
    const parsed = JSON.parse(decoded) as { image?: unknown; description?: unknown; pairedIndex?: unknown };
    return {
      image: resolveMediaUrl(typeof parsed.image === 'string' ? parsed.image : null),
      description: typeof parsed.description === 'string' ? parsed.description.slice(0, 280) : null,
      link: null,
      pairedIndex: parsePairedIndex(parsed.pairedIndex),
    };
  } catch {
    return empty;
  }
}

/**
 * Ktore logo wygrywa, gdy sa dwa.
 *
 * Kolejnosc jest decyzja, nie przypadkiem: NAJPIERW to, co tworca ustawil po
 * starcie (i co przeszlo przez nasza bramke z podpisem), POTEM niezmienne
 * `metadataURI` z lancucha.
 *
 * Odwrotna kolejnosc brzmi bezpieczniej, ale znaczylaby, ze literowka w logo
 * jest nie do poprawienia do konca istnienia tokena - `metadataURI` ustawia sie
 * RAZ, przy starcie, i nie ma settera. Interfejs pokazuje, ktore zrodlo
 * zadzialalo, zeby ta zamiana nie byla niewidoczna.
 */
/**
 * Kolor tokena BEZ logo. Wiekszosc startow nie ma obrazka i glif z inicjalami
 * jest ich jedyna tozsamoscia wizualna - musi wiec byc ten sam w tablicy, na
 * stronie tokena i na karcie udostepniania. Stad wspolna paleta tutaj, obok
 * reszty decyzji o obrazku tokena, a nie w komponencie jednego widoku.
 *
 * Kolor liczy sie z ADRESU, wiec jest staly przez cale zycie tokena i nie
 * wymaga zapisu nigdzie.
 */
const ACCENTS = ['#8b78e6', '#5fa78c', '#d78a55', '#5b8bd9', '#d9628a', '#4fa3a8'];

export function tokenAccent(token: string): string {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export function pickTokenImage(input: {
  profileLogoUrl?: string | null;
  metadataUri?: string | null;
}): { url: string | null; source: 'profile' | 'chain' | null } {
  const fromProfile = resolveMediaUrl(input.profileLogoUrl);
  if (fromProfile) return { url: fromProfile, source: 'profile' };

  const fromChain = parseMetadataUri(input.metadataUri).image;
  if (fromChain) return { url: fromChain, source: 'chain' };

  return { url: null, source: null };
}
