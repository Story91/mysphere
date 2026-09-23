/**
 * Blink: napiwek pod postem z MySphere.
 *
 * ===========================================================================
 * CO TO JEST I CZEGO NIE JEST
 * ===========================================================================
 * Solana Action to endpoint, ktory CUDZY klient (rozszerzenie Phantoma na X,
 * portfel Solflare, interstycjal dial.to) potrafi zamienic w klikalna karte
 * z przyciskiem. Uzytkownik podpisuje transakcje tam, gdzie stoi - nie wchodzi
 * na nasza strone.
 *
 * CZEGO TO NIE JEST: to NIE jest natywne osadzenie w X. Sprawdzone
 * 22.09.2026 w dokumentacji Solany i Phantoma: karta rysuje sie wylacznie
 * u osob, ktore maja zainstalowane rozszerzenie (Phantom, Backpack, Dialect)
 * i WLACZYLY Blinki, bo to funkcja eksperymentalna domyslnie wylaczona.
 * Dodatkowo adres akcji musi byc zarejestrowany w Dialect Actions Registry,
 * inaczej rozszerzenia nie uznaja go za zaufany i nie rozwina.
 * Dla wszystkich pozostalych jest nasza strona /blink/tip/[postId], ktora
 * wykonuje te sama akcje wlasnym portfelem - jedno klikniecie poza X, a nie
 * zero. (Do 23.09.2026 byl tu dial.to Dialectu; jego deployment zostal
 * wstrzymany i przycisk prowadzil donikad.)
 *
 * ===========================================================================
 * KOMU IDZIE NAPIWEK I SKAD TO WIEMY
 * ===========================================================================
 * Autorem posta w bazie jest adres EVM (`author`), bo tozsamosc w calej
 * aplikacji stoi na wagmi. Adres EVM nie przyjmie SOL-a.
 *
 * Ale post z Solany niesie kwit - podpis transakcji w polu `txHash`. Platnik
 * oplaty tej transakcji to portfel Solany, ktorym autor ten post podpisal.
 * Odczytujemy go z lancucha i to on jest odbiorca.
 *
 * Dzieki temu nie trzeba nic dopisywac do dokumentow postow ani niczego
 * migrowac: kazdy post opublikowany na Solanie juz dzis niesie komplet
 * potrzebnych danych.
 *
 * ZASTRZEZENIE: to adres, ktory PODPISAL post, a nie zadeklarowany adres
 * do wyplat. Jesli autor postowal z portfela jednorazowego, napiwek trafi
 * wlasnie tam. Dlatego karta mowi wprost, na ktory adres idzie przelew.
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { MEMO_PROGRAM_ADDRESS, SOLANA_NETWORK_LABEL } from '../../../../basechat/Solana/config/solanaChain';
import { ACTION_HEADERS, actionError, actionJson, misconfiguredCluster, originFrom } from '../../actionHeaders';
import { resolveSolanaPostAuthor, shortenAddress, solanaConnection } from '../../solanaPostAuthor';

export const runtime = 'nodejs';
// Odbiorca wynika ze stanu lancucha, a tresc posta z Firestore - jedno i drugie
// moze sie zmienic, wiec karta nie jest prerenderowana.
export const dynamic = 'force-dynamic';

/** Kwoty na przyciskach. Trzy, bo czwarty przycisk juz sie nie miesci w karcie. */
const PRESET_AMOUNTS_SOL = [0.01, 0.05, 0.25];

/** Gorny limit dla kwoty wpisanej recznie - ochrona przed pomylka o rzad wielkosci. */
const MAX_TIP_SOL = 100;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTION_HEADERS });
}

export async function GET(request: Request, { params }: { params: { postId: string } }) {
  const misconfigured = misconfiguredCluster();
  if (misconfigured) return misconfigured;

  // Portfel autora ze ZWERYFIKOWANEGO kwitu posta - ten sam modul, co przy
  // platnych odpowiedziach (app/api/actions/solanaPostAuthor.ts).
  const resolved = await resolveSolanaPostAuthor(params.postId);
  if (!resolved.ok) return actionError(resolved.error, resolved.status);
  const { post, wallet: recipient, payeeLabel: author } = resolved;

  const origin = originFrom(request);
  const excerpt = post.content.length > 120 ? `${post.content.slice(0, 120)}…` : post.content;
  // Wzgledny: klient Blinka rozwiazuje go wzgledem adresu, z ktorego pobral
  // akcje (patrz originFrom w actionHeaders.ts).
  const base = `/api/actions/tip/${post.id}`;

  return actionJson({
    type: 'action',
    // Karta OG tego posta - Blink pokazuje wiec dokladnie to, co zobaczylby
    // ktos po wejsciu na strone posta.
    icon: `${origin}/post/${post.id}/opengraph-image`,
    title: `Tip ${author} on MySphere`,
    description:
      `${excerpt}\n\n` +
      `Goes to ${recipient.toBase58()} on ${SOLANA_NETWORK_LABEL} - the wallet that signed this post.`,
    label: 'Tip',
    links: {
      actions: [
        ...PRESET_AMOUNTS_SOL.map(amount => ({
          type: 'transaction' as const,
          label: `${amount} SOL`,
          href: `${base}?amount=${amount}`,
        })),
        {
          type: 'transaction' as const,
          label: 'Tip',
          href: `${base}?amount={amount}`,
          parameters: [
            {
              name: 'amount',
              label: 'Amount in SOL',
              type: 'number' as const,
              min: 0.001,
              max: MAX_TIP_SOL,
              required: true,
            },
          ],
        },
      ],
    },
  });
}

export async function POST(request: Request, { params }: { params: { postId: string } }) {
  const misconfigured = misconfiguredCluster();
  if (misconfigured) return misconfigured;

  let body: { account?: string };
  try {
    body = await request.json();
  } catch {
    return actionError('Malformed request.');
  }

  if (!body.account) {
    return actionError('No wallet address was provided.');
  }

  let sender: PublicKey;
  try {
    sender = new PublicKey(body.account);
  } catch {
    return actionError('That is not a valid Solana address.');
  }

  const amountRaw = new URL(request.url).searchParams.get('amount');
  const amount = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
    return actionError('Enter an amount greater than zero.');
  }
  // Minimum 0.001 SOL. Portfel, ktorym podpisano post, bywa pusty (portfele
  // jednorazowe), a Solana nie przyjmie przelewu, po ktorym konto odbiorcy
  // mialoby mniej niz ~0.00089 SOL (rent). Portfel zglaszal to jako "brak
  // srodkow", wiec placacy myslal, ze to jemu brakuje SOL.
  if (amount < 0.001) {
    return actionError('Tips start at 0.001 SOL.');
  }
  if (amount > MAX_TIP_SOL) {
    return actionError(`For safety this Blink is capped at ${MAX_TIP_SOL} SOL.`);
  }

  const resolved = await resolveSolanaPostAuthor(params.postId);
  if (!resolved.ok) return actionError(resolved.error, resolved.status);
  const { post, wallet: recipient } = resolved;

  if (recipient.equals(sender)) {
    // Przelew do samego siebie kosztuje oplate i nie robi nic. Lepiej powiedziec
    // to teraz niz pozwolic podpisac pusty ruch.
    return actionError('This is your own post - tipping yourself would only cost you the fee.');
  }

  // `Math.round`, bo lamport jest liczba calkowita, a 0.1 * LAMPORTS_PER_SOL
  // potrafi w zmiennoprzecinkowej dac 9999999.999999998.
  const lamports = Math.round(amount * LAMPORTS_PER_SOL);
  if (lamports <= 0) {
    return actionError('That amount rounds down to zero lamports.');
  }

  try {
    const conn = solanaConnection();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');

    const transaction = new Transaction({
      feePayer: sender,
      blockhash,
      lastValidBlockHeight,
    }).add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: recipient,
        lamports,
      }),
      // Memo wiaze przelew z konkretnym postem. Bez niego na lancuchu zostaje
      // goly transfer, o ktorym nie da sie powiedziec, za co byl.
      new TransactionInstruction({
        keys: [{ pubkey: sender, isSigner: true, isWritable: false }],
        programId: new PublicKey(MEMO_PROGRAM_ADDRESS),
        data: Buffer.from(`mysphere:tip|${post.id}`, 'utf8'),
      })
    );

    // `requireAllSignatures: false` jest konieczne: transakcja wychodzi stad
    // NIEPODPISANA, a podpisuje ja portfel uzytkownika po swojej stronie.
    const serialized = transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');

    return actionJson({
      type: 'transaction',
      transaction: serialized,
      message: `Tipping ${amount} SOL to ${shortenAddress(recipient.toBase58())} for this post.`,
    });
  } catch (error) {
    console.error('[actions/tip] Nie udalo sie zbudowac transakcji:', error);
    return actionError('Could not build the transaction right now. Try again in a moment.', 502);
  }
}
