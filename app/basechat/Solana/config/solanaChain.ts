/**
 * Solana w basechacie - siec, endpoint i program, na ktory idzie kwit posta.
 *
 * ===========================================================================
 * DLACZEGO MEMO, A NIE WLASNY PROGRAM
 * ===========================================================================
 * Post w tej aplikacji NIE zyje onchain. Tresc, lajki i komentarze siedza w
 * Firestore (patrz `createPost`), a lancuch dostaje wylacznie kwit: podpis
 * transakcji zapisany w polu `txHash`. Sprawdzone: zadna trasa serwerowa tego
 * podpisu nie weryfikuje - weryfikacja receiptow jest tylko tam, gdzie ida
 * pieniadze (Aski, piny).
 *
 * Skoro kwit jest jedynym zadaniem transakcji, wlasny program w Anchorze nie
 * dodalby niczego poza kosztem: depozytem rent za bajtkod (rzedu 1-2 SOL),
 * lancuchem narzedzi Rusta w repo, ktore dzis jest w calosci TypeScriptem, i
 * druga rzecza do utrzymywania. Memo Program stoi na mainnecie i devnecie od
 * lat, jest wbudowany w klaster i nie kosztuje nic.
 *
 * Gdy kiedys post ma faktycznie zyc onchain (indeksowanie, odczyt feedu z
 * lancucha, nagrody za posty) - wtedy wlasny program ma sens i ten plik jest
 * jedynym miejscem, ktore o tym wie.
 *
 * ===========================================================================
 * DEVNET JEST DOMYSLNY I TO JEST CELOWE
 * ===========================================================================
 * Bez `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` wszystko idzie na devnet, gdzie
 * SOL jest darmowy z faucetu. Wlasciciel przelacza na mainnet jedna zmienna
 * srodowiskowa, bez zmiany kodu - tak jak przy kontrakcie Arc.
 */

/**
 * UWAGA: ten plik NIE MOZE importowac z '@solana/web3.js'.
 *
 * Czyta go rowniez PostList (po sufiks klastra do linku eksploratora), a
 * PostList siedzi w glownym bundle feedu. Jeden import web3.js tutaj
 * przeciagnalby caly stack Solany do kazdego uzytkownika, ktory otwiera feed -
 * czyli dokladnie to, czemu zapobiega dynamiczne ladowanie providera.
 *
 * Dlatego adres programu jest stringiem, a `new PublicKey(...)` powstaje
 * dopiero w przycisku, ktory i tak jest ladowany leniwie.
 */

export type SolanaCluster = 'devnet' | 'mainnet-beta';

/** Devnet, dopoki wlasciciel nie ustawi zmiennej. Patrz naglowek. */
export const SOLANA_CLUSTER: SolanaCluster =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';

export const IS_SOLANA_MAINNET = SOLANA_CLUSTER === 'mainnet-beta';

/**
 * Endpoint RPC.
 *
 * ===========================================================================
 * DLACZEGO MAINNET NIE IDZIE NA api.mainnet-beta.solana.com
 * ===========================================================================
 * Bo z przegladarki NIE DZIALA. Nie "jest wolny" - odmawia. Zmierzone
 * 22.09.2026 przy pierwszej probie posta na mainnecie:
 *
 *   POST https://api.mainnet-beta.solana.com  ->  403 "Access forbidden"
 *
 * Uzytkownik zobaczyl "Transaction failed: failed to get recent blockhash".
 * Ten endpoint jest przeznaczony do lokalnego developmentu, a nie do ruchu
 * z aplikacji - Solana Foundation odrzuca zapytania spoza wlasnych narzedzi.
 *
 * Zmierzone tego samego dnia, tym samym zapytaniem (getLatestBlockhash,
 * naglowek Origin ustawiony na adres aplikacji):
 *
 *   api.mainnet-beta.solana.com   403  (brak blockhasha)
 *   rpc.ankr.com/solana           403  (brak blockhasha)
 *   solana.drpc.org               400  (brak blockhasha)
 *   solana-rpc.publicnode.com     200  blockhash OK, CORS `*`
 *
 * Stad publicnode jako domyslny. To ten sam dostawca, z ktorego ta aplikacja
 * korzysta juz dla Ethereum i Linei (app/providers.tsx), wiec nie doklada
 * nowej zaleznosci. Sprawdzone tez, ze przepuszcza `sendTransaction` - czesc
 * publicznych RPC przyjmuje odczyty, ale blokuje wysylke.
 *
 * POD REALNY RUCH i tak ustaw wlasny endpoint (Helius / QuickNode / Triton)
 * przez NEXT_PUBLIC_SOLANA_RPC_URL. Publiczny nie daje gwarancji dostepnosci
 * ani limitow - jest dobrym domyslnym, a nie docelowym rozwiazaniem.
 *
 * Devnet zostaje na api.devnet.solana.com: tam publiczny endpoint odpowiada
 * normalnie i nie wymaga konta.
 */
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (IS_SOLANA_MAINNET ? 'https://solana-rpc.publicnode.com' : 'https://api.devnet.solana.com');

/** Memo Program v2 - ten sam adres na kazdym klastrze. String, patrz naglowek. */
export const MEMO_PROGRAM_ADDRESS = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/**
 * Memo Program v1 - uzywany WYLACZNIE przez Proof of Bags.
 *
 * Roznica, dla ktorej istnieje: v2 odrzuca kazde przekazane konto, ktore nie
 * podpisuje (`MissingRequiredSignature`), a v1 konta ignoruje. Dzieki temu
 * transakcja posta moze zawierac konto tokenowe autora tylko do odczytu, a
 * runtime zapisze jego saldo w metadanych. Zmierzone symulacja na mainnecie
 * 2026-09-23 - spec: docs/superpowers/specs/2026-09-23-proof-of-bags-design.md.
 */
export const MEMO_V1_PROGRAM_ADDRESS = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';

export const SOLANA_NETWORK_LABEL = IS_SOLANA_MAINNET ? 'Solana' : 'Solana devnet';

/**
 * Prefiks linku do eksploratora. explorer.solana.com zamiast Solscana, bo
 * przyjmuje `?cluster=devnet` - na devnecie Solscan pokazuje pusta strone.
 */
export const SOLANA_EXPLORER_TX_URL = IS_SOLANA_MAINNET
  ? 'https://explorer.solana.com/tx/'
  : 'https://explorer.solana.com/tx/';

/** Sufiks klastra doklejany do linku - pusty na mainnecie. */
export const SOLANA_EXPLORER_SUFFIX = IS_SOLANA_MAINNET ? '' : '?cluster=devnet';

/** Pelny link do transakcji w eksploratorze. */
export function solanaExplorerTxUrl(signature: string): string {
  return `${SOLANA_EXPLORER_TX_URL}${signature}${SOLANA_EXPLORER_SUFFIX}`;
}

/**
 * Tresc memo zapisywana onchain. Sam post zostaje w Firestore - onchain idzie
 * krotki odcisk, zeby transakcja nie rosla razem z dlugim postem (limit
 * transakcji to 1232 bajty, a memo placi za kazdy bajt rozmiarem transakcji).
 *
 * === DLACZEGO LIMIT W BAJTACH, A NIE W ZNAKACH ===
 * Do 23.09.2026 stalo tu 180 ZNAKOW. Znak to od 1 do 4 bajtow UTF-8, wiec post
 * z samych emoji dawal ~720 bajtow memo. Z instrukcja Proof of Bags (trzy
 * konta tokenowe, programy tokena, ~150 bajtow danych) taka transakcja zblizala
 * sie do limitu 1232 i portfel odrzucilby ja bez slowa wyjasnienia. 280 bajtow
 * zostawia zapas w najgorszym przypadku, a dla zwyklego tekstu po angielsku
 * miesci wiecej niz dawne 180 znakow.
 */
export const SOLANA_MEMO_MAX_BYTES = 280;

const POST_MEMO_PREFIX = 'mysphere:post|';
const ELLIPSIS = '…';

/** Ta sama normalizacja przy budowie memo i przy jego sprawdzaniu. */
export function normalizePostText(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Przycina tekst do `maxBytes` bajtow UTF-8, nie rozrywajac znaku - iteracja
 * po punktach kodowych, a nie po jednostkach UTF-16, wiec emoji z para
 * zastepcza nie zostanie przeciete w polowie (to dawalo U+FFFD na lancuchu).
 */
function truncateUtf8(text: string, maxBytes: number): string {
  if (utf8Length(text) <= maxBytes) return text;
  const budget = maxBytes - utf8Length(ELLIPSIS);
  let used = 0;
  let out = '';
  for (const ch of Array.from(text)) {
    const size = utf8Length(ch);
    if (used + size > budget) break;
    out += ch;
    used += size;
  }
  return `${out}${ELLIPSIS}`;
}

/** Cialo memo, jakie z tej tresci buduje dzisiejszy przycisk. */
export function postMemoBody(content: string): string {
  return truncateUtf8(normalizePostText(content), SOLANA_MEMO_MAX_BYTES);
}

/**
 * Identyfikator posta: 20 znakow z alfabetu, ktorego uzywa Firestore dla
 * automatycznych ID. Powstaje W PRZEGLADARCE przed transakcja, bo memo musi
 * go niesc - patrz `buildPostMemo`.
 */
const POST_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newPostId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  // 256 % 62 != 0, wiec odrzucamy bajty z niepelnego ostatniego przedzialu -
  // inaczej pierwsze litery alfabetu wypadalyby czesciej.
  let out = '';
  while (out.length < 20) {
    for (const b of Array.from(bytes)) {
      if (b < 248 && out.length < 20) out += POST_ID_ALPHABET[b % 62];
    }
    crypto.getRandomValues(bytes);
  }
  return out;
}

/**
 * Jakie identyfikatory postow w ogole przyjmujemy od klienta. Firestore
 * pozwala na `|` w ID, a `|` jest separatorem pol memo - post `abc|x`
 * rozjechalby parsowanie kazdej platnej odpowiedzi.
 */
export const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidPostId(postId: unknown): postId is string {
  return typeof postId === 'string' && POST_ID_PATTERN.test(postId);
}

const POST_MEMO_V2 = 'v2|';

/**
 * Memo posta.
 *
 * === DLACZEGO OD 23.09.2026 MEMO NIESIE ID POSTA (v2) ===
 * Drugi przeglad przeciwnika pokazal, ze memo bez ID da sie podpiac pod
 * DOWOLNY post o tej samej tresci: wystarczylo skasowac cudzy post i zalozyc
 * go od nowa (Firestore nadaje wtedy nowy `createTime`, wiec okno czasowe nic
 * nie dawalo) z wlasna transakcja - i napiwki szly na obcy portfel.
 *
 * Z ID w memo jedna transakcja nalezy do jednego posta na zawsze, a post
 * zapisuje serwer (POST /api/solana/post) razem z wpisem w rejestrze kwitow.
 * Format:  mysphere:post|v2|<postId>|<podpisujacy>|<tresc>
 * Stary format bez ID (`mysphere:post|<podpisujacy>|<tresc>`) nadal sie
 * parsuje - czyta go Proof of Bags i jednorazowa migracja starych postow.
 */
export function buildPostMemo(content: string, author: string, postId: string): string {
  return `${POST_MEMO_PREFIX}${POST_MEMO_V2}${postId}|${author}|${postMemoBody(content)}`;
}

export interface ParsedPostMemo {
  author: string;
  body: string;
  /** ID posta z memo v2; `null` dla starego formatu. */
  postId: string | null;
}

/**
 * Rozbiera memo posta. Tresc moze zawierac `|`, wiec pola przed trescia
 * wycinamy po kolei, a reszta to cialo. Klucz base58 nigdy nie brzmi "v2",
 * wiec oba formaty sie nie myla.
 */
export function parsePostMemo(memo: string): ParsedPostMemo | null {
  if (!memo.startsWith(POST_MEMO_PREFIX)) return null;
  let rest = memo.slice(POST_MEMO_PREFIX.length);
  let postId: string | null = null;
  if (rest.startsWith(POST_MEMO_V2)) {
    rest = rest.slice(POST_MEMO_V2.length);
    const idEnd = rest.indexOf('|');
    if (idEnd <= 0) return null;
    postId = rest.slice(0, idEnd);
    if (!POST_ID_PATTERN.test(postId)) return null;
    rest = rest.slice(idEnd + 1);
  }
  const separator = rest.indexOf('|');
  if (separator <= 0) return null;
  return { author: rest.slice(0, separator), body: rest.slice(separator + 1), postId };
}

/** Cialo memo w formacie sprzed 23.09.2026: 179 ZNAKOW i wielokropek. */
function legacyPostMemoBody(content: string): string {
  const text = normalizePostText(content);
  return text.length > 180 ? `${text.slice(0, 179)}${ELLIPSIS}` : text;
}

/**
 * Czy memo z lancucha nalezy do TEGO posta - DOKLADNIE, nie prefiksem.
 *
 * === DLACZEGO DOKLADNIE ===
 * Do 23.09.2026 wystarczal prefiks. Przeglad przeciwnika pokazal skutek:
 * memo "G" pasowalo do kazdego posta zaczynajacego sie na G, wiec jedna tania
 * transakcja pozwalala podpiac sie pod dowolnie wiele cudzych postow. Teraz
 * cialo memo musi byc dokladnie tym, co z tresci posta zbudowalby nasz
 * przycisk - w formacie dzisiejszym (po bajtach) albo sprzed 23.09 (po
 * znakach).
 *
 * Uzywane juz tylko przez jednorazowa migracje postow sprzed memo v2 (tam
 * razem z oknem czasowym `isReceiptTimely`). Nowe posty wiaze ID w memo.
 */
export function memoMatchesPost(memoBody: string, postContent: string): boolean {
  if (!memoBody) return false;
  return memoBody === postMemoBody(postContent) || memoBody === legacyPostMemoBody(postContent);
}

/**
 * Ile przed utworzeniem dokumentu posta moze byc potwierdzona jego transakcja.
 * Przycisk wysyla transakcje, czeka na potwierdzenie i dopiero wtedy zapisuje
 * post - zwykle to sekundy. 15 minut to zapas na czlowieka, ktory dlugo czytal
 * okno portfela, i na opoznione potwierdzenie.
 */
export const RECEIPT_MAX_LEAD_MS = 15 * 60 * 1000;
/** Blok moze "wyprzedzic" zapis o kilka sekund zegara - dwie minuty luzu. */
export const RECEIPT_MAX_LAG_MS = 2 * 60 * 1000;

/**
 * Czy transakcja mogla byc kwitem posta utworzonego w chwili `postCreatedMs`.
 *
 * `postCreatedMs` MUSI pochodzic z `createTime` dokumentu, ktory nadaje
 * Firestore i ktorego klient nie nadpisze - a nie z pola `timestamp`, ktore
 * przy obecnych regulach moze zmienic kazdy. Czasu bloku na Solanie tez nie da
 * sie cofnac, wiec do posta sprzed tygodnia nie podepnie sie transakcja
 * wyslana dzis.
 */
export function isReceiptTimely(blockTimeSec: number | null, postCreatedMs: number): boolean {
  if (blockTimeSec === null || !Number.isFinite(postCreatedMs)) return false;
  const blockMs = blockTimeSec * 1000;
  return blockMs >= postCreatedMs - RECEIPT_MAX_LEAD_MS && blockMs <= postCreatedMs + RECEIPT_MAX_LAG_MS;
}
