import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { getAddress, isAddress } from 'viem';
import { base } from 'viem/chains';
import { getPublicDb as getDb } from '../publicFirestore';
import { getAvatar } from './getAvatar';
import { getName } from './getName';
import { getSlicedAddress, isBasename } from './resolver';

/**
 * Tozsamosc dla LISTY adresow naraz - nazwa i awatar.
 *
 * === PO CO TO ISTNIEJE ===
 * Strony, ktore pokazuja liste ludzi (/leaderboard, karty OG), mialy do wyboru
 * dwie zle drogi: albo N+1 odczytow Firestore i N wywolan RPC na kazdy wiersz,
 * albo - co faktycznie sie stalo - rezygnacje i goly adres w kazdej linii.
 * Ten modul robi to raz, wsadowo, dla calej listy.
 *
 * === KOSZT, BO TU JEST KRYTYCZNY ===
 * Baza ma 184 tys. kont; skanowanie kolekcji `users` albo `usernames` jest
 * wykluczone, agregacje na tym projekcie i tak odmawiaja (RESOURCE_EXHAUSTED).
 * Dlatego czytamy WYLACZNIE po identyfikatorze dokumentu, paczkami po 30
 * (`where(documentId(), 'in', ...)` - twardy limit Firestore). Zmierzone na
 * produkcji dla 26 adresow strony Paid: 4 zapytania, ~48 odczytow dokumentow.
 *
 * Lancuch dotykamy dopiero dla adresow, ktorych NIE MA w `usernames` - na tej
 * samej probce bylo ich 4 z 26. Rownolegle, ale z limitem RPC_CONCURRENCY i
 * twardym budzetem czasu, zeby jeden niereagujacy adres nie trzymal calej
 * strony.
 *
 * === KOLEJNOSC PIERWSZENSTWA NAZWY (i dlaczego taka) ===
 *  1. BASENAME z `usernames/{adres}` przy `isBaseName === true`.
 *     Basename jest jedyna nazwa na tej liscie, ktora ktos MUSIAL kupic i
 *     ktora da sie sprawdzic na lancuchu - a ta strona w calosci stoi na
 *     sprawdzalnosci, wiec nazwa sprawdzalna bije nazwe wpisana z klawiatury.
 *     Rekord w Firestore nie jest tu osobnym zrodlem prawdy, tylko odbiciem
 *     lancucha zapisanym przez aplikacje: ta sama wartosc za jeden odczyt
 *     zamiast dwoch wywolan RPC.
 *  2. BASENAME/ENS Z LANCUCHA - tylko dla adresow bez rekordu wyzej.
 *     Dokladnie ta sama klasa nazwy, po prostu drozsza w zdobyciu.
 *  3. NAZWA Z PROFILU (`users/{adres}.name`, dalej `usernames/{adres}.name`
 *     bez flagi basename). To zwykle pole tekstowe - nikt go nie weryfikuje,
 *     wiec stoi nizej niz lancuch, ale wyzej niz adres: czlowiek, ktory
 *     nazwal sie "sophia.sphere", chce byc tak widziany.
 *  4. ADRES SKROCONY - ostatnia deska ratunku, nie jedyna.
 *
 * === KOLEJNOSC PIERWSZENSTWA AWATARA ===
 *  1. `users/{adres}.avatar` - obraz wgrany W TYM produkcie. Jest juz na naszym
 *     CDN, wiec nie kosztuje ani jednego wywolania RPC, i jest swiadomym
 *     wyborem czlowieka wewnatrz tej aplikacji.
 *  2. Rekord tekstowy `avatar` z L2Resolvera / ENS - tylko dla tych, ktorzy
 *     maja rozwiazana nazwe i nie maja obrazu u nas.
 *  3. `null` - warstwa widoku rysuje wtedy wlasny, deterministyczny znaczek.
 *     NIE probujemy zgadywac obrazka; brak awatara to brak awatara.
 *
 * WIELKOSC LITER: kolekcje historycznie trzymaja adres raz w checksumie, raz
 * malymi literami (ten sam powod, dla ktorego getProfile.ts odpytuje oba
 * warianty). Do paczki wchodza wiec obie postacie - Firestore liczy odczyty za
 * ZWROCONE dokumenty, wiec drugi wariant nie kosztuje nic poza dlugoscia listy.
 */

export type Identity = {
  /** Adres malymi literami - klucz mapy i forma do porownywania. */
  address: string;
  /** Nazwa do wyswietlenia. Zawsze niepusta - w najgorszym razie skrot adresu. */
  name: string;
  /** URL awatara albo `null`, gdy zadnego nie znalezlismy. */
  avatar: string | null;
  /**
   * `true` = `name` jest nazwa (Basename/ENS/profil), a nie skrotem adresu.
   * Widok uzywa tego, zeby nie ozdabiac skrotu adresu tak jak nazwiska.
   */
  named: boolean;
};

/** Maksimum wartosci w `where(... 'in' ...)` - limit Firestore, nie nasz. */
const ID_BATCH = 30;

/** Ile rozwiazan z lancucha leci naraz. */
const RPC_CONCURRENCY = 6;

/**
 * Budzet czasu na JEDNO rozwiazanie z lancucha.
 *
 * getName robi reverse na Base, a potem weryfikacje w przod przez mainnet.
 * Adres bez zadnej nazwy przechodzi cala te droge, zanim zwroci null. Bez
 * budzetu jeden zawieszony RPC trzymalby cala strone; z budzetem najgorszy
 * przypadek to brak nazwy przy jednym wierszu, a nie strona, ktora sie nie
 * renderuje.
 */
const RPC_BUDGET_MS = 5000;

/**
 * Ile adresow w ogole wolno tknac lancuchem w jednym przebiegu.
 *
 * Zabezpieczenie przed lista, ktora kiedys urosnie: lepiej pokazac skrot
 * adresu przy kilku pozycjach niz wystrzelic setki wywolan RPC z renderu.
 */
const RPC_MAX_ADDRESSES = 60;

/** Odrzuca wartosci, ktore nie sa adresem, i normalizuje do malych liter. */
function normalize(addresses: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of addresses) {
    if (typeof value !== 'string' || !isAddress(value)) continue;
    seen.add(value.toLowerCase());
  }
  return Array.from(seen);
}

/** Obie postacie zapisu adresu - checksum i male litery, bez duplikatu. */
function variantsOf(lowercase: string): string[] {
  const checksummed = getAddress(lowercase as `0x${string}`);
  return checksummed === lowercase ? [lowercase] : [checksummed, lowercase];
}

/**
 * Czy zapisana "nazwa" to w rzeczywistosci skrocony adres.
 *
 * W kolekcji `users` piec z dwudziestu szesciu profili strony Paid ma
 * `name: "0x219B...a599"` - warstwa zapisu wstawiala tam skrot adresu jako
 * wartosc domyslna. Wziete za nazwe, wygladalo by to jak rozwiazana tozsamosc,
 * a byloby tym samym adresem w gorszym opakowaniu. Sprawdzamy KSZTALT (0x…
 * z wielokropkiem) i dopiero potem, czy poczatek i koniec pasuja do adresu -
 * dzieki temu prawdziwa nazwa "0xmysphere.base.eth" nie wpada w ten filtr.
 */
function isAddressPlaceholder(name: string, lowercaseAddress: string): boolean {
  const compact = name.replace(/\s+/g, '');
  if (!/^0x[0-9a-f]{2,}(\.{2,}|…)[0-9a-f]{2,}$/i.test(compact)) return false;
  const head = compact.slice(0, 6).toLowerCase();
  const tail = compact.slice(-4).toLowerCase();
  return lowercaseAddress.startsWith(head) && lowercaseAddress.endsWith(tail);
}

/** Nazwa nadaje sie do pokazania tylko wtedy, gdy nie jest przebranym adresem. */
function usableName(value: unknown, lowercaseAddress: string): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isAddressPlaceholder(trimmed, lowercaseAddress) ? null : trimmed;
}

/** Wykonuje `task` na kazdym elemencie, ale najwyzej `limit` naraz. */
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Zwraca wynik albo `null`, gdy nie zmiescil sie w budzecie czasu. */
function withBudget<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    work
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Nazwy i awatary dla listy adresow. Klucz mapy to adres MALYMI LITERAMI.
 *
 * Nie rzuca wyjatkiem: strona, na ktorej ta funkcja zawiedzie, ma dalej
 * pokazac kwoty i hashe - one sa tu trescia, tozsamosc jest ozdoba. Kazdy
 * adres dostaje wpis, wiec `map.get(...)` nigdy nie oddaje undefined dla
 * adresu, ktory podano na wejsciu.
 */
export async function getIdentities(addresses: readonly string[]): Promise<Map<string, Identity>> {
  const wanted = normalize(addresses);
  const identities = new Map<string, Identity>(
    wanted.map((address) => [
      address,
      { address, name: getSlicedAddress(address), avatar: null, named: false },
    ])
  );

  if (wanted.length === 0) return identities;

  // --- 1. Firestore, wsadowo, wylacznie po identyfikatorze dokumentu ---

  /** Dokumenty z jednej kolekcji, przypisane z powrotem do malych liter adresu. */
  const readById = async (name: 'users' | 'usernames') => {
    const found = new Map<string, Record<string, unknown>>();
    const ids = wanted.flatMap(variantsOf);
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += ID_BATCH) {
      chunks.push(ids.slice(index, index + ID_BATCH));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const snapshot = await getDocs(
            query(collection(getDb(), name), where(documentId(), 'in', chunk))
          );
          for (const document of snapshot.docs) {
            found.set(document.id.toLowerCase(), document.data() as Record<string, unknown>);
          }
        } catch (error) {
          // Nieudany odczyt tozsamosci NIE moze zabrac strony. Wpis zostaje
          // przy skrocie adresu, a powod ladnie widac w logach.
          console.error(`[getIdentities] Odczyt ${name} nie powiodl sie:`, error);
        }
      })
    );

    return found;
  };

  const [users, usernames] = await Promise.all([readById('users'), readById('usernames')]);

  /** Adresy bez zapisanego basename - te i tylko te pojda na lancuch. */
  const needChainName: string[] = [];

  for (const address of wanted) {
    const entry = identities.get(address)!;
    const userDoc = users.get(address);
    const nameDoc = usernames.get(address);

    const storedAvatar = userDoc?.avatar;
    if (typeof storedAvatar === 'string' && storedAvatar.trim()) {
      entry.avatar = storedAvatar.trim();
    }

    // Tier 1: basename juz zapisany przez aplikacje.
    const cachedBasename = nameDoc?.isBaseName === true ? usableName(nameDoc.name, address) : null;
    if (cachedBasename) {
      entry.name = cachedBasename;
      entry.named = true;
      continue;
    }

    // Tier 3 wstawiamy od razu - zostanie, jesli lancuch nic nie odda.
    const profileName = usableName(userDoc?.name, address) ?? usableName(nameDoc?.name, address);
    if (profileName) {
      entry.name = profileName;
      entry.named = true;
    }

    needChainName.push(address);
  }

  // --- 2. Nazwy z lancucha, tylko dla reszty, rownolegle i z limitem ---

  await mapWithLimit(
    needChainName.slice(0, RPC_MAX_ADDRESSES),
    RPC_CONCURRENCY,
    async (address) => {
      // `chain: base` jest tu CALYM sednem. Domyslka getName to mainnet, a przy
      // mainnecie funkcja pomija L2Resolvera Basenames i pyta wylacznie o ENS -
      // wiec kazdy wlasciciel *.base.eth wracal jako null i lista pokazywala
      // goly adres. To byl caly powod, dla ktorego Paid wygladalo na spis
      // portfeli zamiast na liste ludzi.
      const resolved = await withBudget(
        getName({ address: address as `0x${string}`, chain: base }),
        RPC_BUDGET_MS
      );

      if (resolved) {
        const entry = identities.get(address)!;
        entry.name = resolved;
        entry.named = true;
      }
    }
  );

  // --- 3. Awatary z lancucha - dopiero dla tych, ktorzy nie maja wlasnego ---

  /**
   * Pytamy wylacznie przy nazwach, ktore NAPRAWDE moga miec rekord `avatar`:
   * Basename albo ENS. Nazwa profilowa w rodzaju "sophia.sphere" nie istnieje
   * w zadnym rejestrze, wiec wyslanie jej na resolver to dwa wywolania RPC z
   * gory znanym wynikiem.
   */
  const needChainAvatar = wanted.filter((address) => {
    const entry = identities.get(address)!;
    return !entry.avatar && entry.named && (isBasename(entry.name) || entry.name.endsWith('.eth'));
  });

  await mapWithLimit(
    needChainAvatar.slice(0, RPC_MAX_ADDRESSES),
    RPC_CONCURRENCY,
    async (address) => {
      const entry = identities.get(address)!;
      const onchainAvatar = await withBudget(
        getAvatar({ ensName: entry.name, chain: base }),
        RPC_BUDGET_MS
      );
      if (onchainAvatar) entry.avatar = onchainAvatar;
    }
  );

  return identities;
}
