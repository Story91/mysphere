/**
 * Adresy IPFS w aplikacji.
 *
 * STAN PRZED (zmierzone 2026-09-11): ta funkcja podmieniala wylacznie prefiks
 * `ipfs://` na `https://ipfs.io/ipfs/`. Nie pomagalo to w zadnym z dwoch
 * realnych przypadkow:
 *
 *   1. IP NFT Camp Origin maja tokenURI na PRYWATNEJ bramce mintujacego
 *      (`ivory-total-ox-210.mypinata.cloud`), czyli zwykly https - przechodzil
 *      tedy bez zmian i konczyl sie 403, bo ta bramka wyczerpala darmowy limit.
 *      Stad "PREVIEW UNAVAILABLE" na kazdej karcie marketplace.
 *   2. ipfs.io samo w sobie odmawia przy serii zadan (429).
 *
 * TERAZ: kazdy adres wskazujacy na CID idzie przez `/api/ipfs`, ktore pyta
 * kilku bramek i cache'uje odpowiedz na stale (CID = skrot tresci, wiec nie ma
 * czego odswiezac). Adresy spoza IPFS wracaja bez zmian.
 */

/**
 * CID v0 (Qm...) albo v1 (base32 `b`, base36 `k`, base58 `z`, base16 `f`).
 * Swiadomie bez dekodowania multihasha - to sito na smieci, nie walidator.
 */
const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,}|B[A-Z2-7]{50,}|k[a-z0-9]{50,}|z[1-9A-HJ-NP-Za-km-z]{45,}|f[0-9a-f]{50,})$/;

/** Segment sciezki pod CID-em. Bez `..`, bez ukosnikow, bez znakow sterujacych. */
const SEGMENT_RE = /^[A-Za-z0-9._~%!$&'()*+,;=:@-]+$/;

export interface IpfsRef {
  cid: string;
  path: string;
}

/**
 * Wyciaga CID i sciezke z dowolnego adresu wskazujacego na IPFS:
 * `ipfs://<cid>/...`, `https://<dowolna-brama>/ipfs/<cid>/...`,
 * `https://<cid>.ipfs.<brama>/...` oraz goly CID.
 *
 * Zwraca null dla wszystkiego innego - wolajacy uzywa wtedy oryginalu.
 */
export function parseIpfsRef(input: string): IpfsRef | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();

  let candidate = '';
  let rest = '';

  if (raw.startsWith('ipfs://')) {
    const withoutScheme = raw.slice('ipfs://'.length).replace(/^ipfs\//, '');
    const slash = withoutScheme.indexOf('/');
    candidate = slash === -1 ? withoutScheme : withoutScheme.slice(0, slash);
    rest = slash === -1 ? '' : withoutScheme.slice(slash + 1);
  } else if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const marker = url.pathname.match(/\/ipfs\/([^/]+)(?:\/(.*))?$/);
    if (marker) {
      candidate = marker[1];
      rest = marker[2] || '';
    } else {
      const sub = url.hostname.match(/^([^.]+)\.ipfs\./i);
      if (!sub) return null;
      candidate = sub[1];
      rest = url.pathname.replace(/^\//, '');
    }
    // Zapytanie oryginalu pomijamy celowo: klucze prywatnych bram nie maja po
    // co jechac dalej, a sam CID w zupelnosci wystarcza do pobrania tresci.
  } else {
    candidate = raw;
  }

  if (!CID_RE.test(candidate)) return null;

  const segments = rest.split('/').filter(Boolean);
  if (segments.some((s) => s === '..' || s === '.' || !SEGMENT_RE.test(s))) return null;

  return { cid: candidate, path: segments.join('/') };
}

/** Czy ten adres wskazuje na tresc w IPFS. */
export function isIpfsUrl(uri: string): boolean {
  return parseIpfsRef(uri) !== null;
}

/**
 * Adres, pod ktory mozna uderzyc z przegladarki: `<img src>` albo `fetch`.
 * Tresc IPFS idzie przez wlasne proxy, reszta wraca bez zmian.
 */
export function ipfsToHttp(uri: string): string {
  if (!uri) return '';
  const ref = parseIpfsRef(uri);
  if (!ref) return uri;
  const target = `ipfs://${ref.cid}${ref.path ? `/${ref.path}` : ''}`;
  return `/api/ipfs?u=${encodeURIComponent(target)}`;
}

export default ipfsToHttp;
