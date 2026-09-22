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
 */
export const SOLANA_MEMO_MAX_CHARS = 180;

export function buildPostMemo(content: string, author: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  const body =
    trimmed.length > SOLANA_MEMO_MAX_CHARS
      ? `${trimmed.slice(0, SOLANA_MEMO_MAX_CHARS - 1)}…`
      : trimmed;
  return `mysphere:post|${author}|${body}`;
}
