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
 * Dla wszystkich pozostalych dziala link przez dial.to - jedno klikniecie
 * poza X, a nie zero.
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
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getPostForShare } from '../../../../utils/posts/getPostForShare';
import {
  MEMO_PROGRAM_ADDRESS,
  SOLANA_NETWORK_LABEL,
  SOLANA_RPC_URL,
} from '../../../../basechat/Solana/config/solanaChain';
import { ACTION_HEADERS, actionError, actionJson, originFrom } from '../../actionHeaders';

export const runtime = 'nodejs';
// Odbiorca wynika ze stanu lancucha, a tresc posta z Firestore - jedno i drugie
// moze sie zmienic, wiec karta nie jest prerenderowana.
export const dynamic = 'force-dynamic';

/** Kwoty na przyciskach. Trzy, bo czwarty przycisk juz sie nie miesci w karcie. */
const PRESET_AMOUNTS_SOL = [0.01, 0.05, 0.25];

/** Gorny limit dla kwoty wpisanej recznie - ochrona przed pomylka o rzad wielkosci. */
const MAX_TIP_SOL = 100;

function connection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

/**
 * Adres Solany autora posta, odczytany z kwitu. `null`, gdy post nie pochodzi
 * z Solany albo gdy transakcji nie da sie odczytac.
 */
async function resolveRecipient(txHash: string): Promise<PublicKey | null> {
  try {
    const tx = await connection().getTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return null;

    // Pierwszy klucz w tablicy kont to zawsze platnik oplaty, czyli podpisujacy.
    const keys = tx.transaction.message.getAccountKeys();
    const payer = keys.get(0);
    return payer ?? null;
  } catch (error) {
    console.error('[actions/tip] Nie udalo sie odczytac transakcji posta:', error);
    return null;
  }
}

function shorten(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTION_HEADERS });
}

export async function GET(request: Request, { params }: { params: { postId: string } }) {
  const post = await getPostForShare(params.postId).catch(() => null);

  if (!post) {
    return actionError('This post no longer exists.', 404);
  }

  if (post.network !== 'solana' || !post.txHash) {
    // Post z innej sieci nie ma adresu Solany, na ktory mozna wyslac napiwek.
    // Mowimy to wprost zamiast pokazywac karte, ktora i tak by nie zadzialala.
    return actionError('This post was not published on Solana, so it cannot be tipped in SOL.', 400);
  }

  const recipient = await resolveRecipient(post.txHash);
  if (!recipient) {
    return actionError('The on-chain receipt for this post could not be read right now.', 502);
  }

  const origin = originFrom(request);
  const author = post.authorName || shorten(post.author);
  const excerpt = post.content.length > 120 ? `${post.content.slice(0, 120)}…` : post.content;
  const base = `${origin}/api/actions/tip/${post.id}`;

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
              min: 0.000001,
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
  if (amount > MAX_TIP_SOL) {
    return actionError(`For safety this Blink is capped at ${MAX_TIP_SOL} SOL.`);
  }

  const post = await getPostForShare(params.postId).catch(() => null);
  if (!post) {
    return actionError('This post no longer exists.', 404);
  }
  if (post.network !== 'solana' || !post.txHash) {
    return actionError('This post was not published on Solana, so it cannot be tipped in SOL.');
  }

  const recipient = await resolveRecipient(post.txHash);
  if (!recipient) {
    return actionError('The on-chain receipt for this post could not be read right now.', 502);
  }

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
    const conn = connection();
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
      message: `Tipping ${amount} SOL to ${shorten(recipient.toBase58())} for this post.`,
    });
  } catch (error) {
    console.error('[actions/tip] Nie udalo sie zbudowac transakcji:', error);
    return actionError('Could not build the transaction right now. Try again in a moment.', 502);
  }
}
