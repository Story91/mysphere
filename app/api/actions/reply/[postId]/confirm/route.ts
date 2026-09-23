/**
 * Druga polowa platnej odpowiedzi: klient Blinka (albo nasza strona) odsyla
 * podpis potwierdzonej transakcji, a serwer zapisuje komentarz.
 *
 * Tresc komentarza pochodzi Z MEMO NA LANCUCHU, nie z tego zadania - w feedzie
 * laduje dokladnie to, co odpowiadajacy podpisal i oplacil. Zapis jest
 * idempotentny (dokument = podpis), wiec ponowienie jest bezpieczne.
 *
 * ===========================================================================
 * DLACZEGO ZAWSZE HTTP 200
 * ===========================================================================
 * To jest callback "action chaining". Klient Blinka (blinks-core, chain())
 * na KAZDA odpowiedz inna niz 2xx robi `return null`, a to konczy sie
 * pokazaniem komunikatu SUKCESU z poprzedniego kroku. Przy 409 "siec jeszcze
 * nie potwierdzila" albo 503 "zapis chwilowo niemozliwy" czlowiek widzial w X
 * "gotowe", a jego oplacona odpowiedz nigdzie nie ladowala (znalezisko
 * z przegladu 2026-09-23).
 *
 * Dlatego stan idzie W TRESCI:
 *   - `type: 'completed'` - zapisane albo definitywnie odrzucone (z `error`),
 *   - `type: 'action'` z linkiem "Retry saving" - oplacone, ale jeszcze
 *     niezapisane; link niesie podpis, wiec ponowienie nie wymaga niczego od
 *     uzytkownika poza kliknieciem.
 * Dodatkowe pola `status` i `tipLamports` czyta nasza strona odpowiedzi;
 * klienci Blinkow je ignoruja.
 *
 * ===========================================================================
 * DWOCH WOLAJACYCH, DWA KSZTALTY ODPOWIEDZI
 * ===========================================================================
 * 1. Callback lancucha (`links.next` transakcji) i nasza strona: cialo niesie
 *    `signature`, a spec oczekuje NextAction wprost.
 * 2. Link "Retry saving" (LinkedAction typu `post`): cialo to tylko
 *    `{ account, type: 'post' }`, podpis siedzi w adresie. Spec oczekuje wtedy
 *    PostResponse `{ type: 'post', links: { next: { type: 'inline', action } } }`.
 *    Do 23.09.2026 oba dostawaly goly NextAction, wiec klient nie umial
 *    pokazac wyniku ponowienia (znalezisko z przegladu). Pole `error` NIE
 *    moze stac na wierzchu PostResponse - blinks-core bierze je za blad
 *    samego zadania - wiec blad zyje tylko w akcji inline.
 */

import { revalidatePath } from 'next/cache';
import { isValidPostId } from '../../../../../basechat/Solana/config/solanaChain';
import {
  isSolanaAddress,
  isSolanaSignature,
  verifyReplyTransaction,
  type ReplyCheck,
} from '../../../../../basechat/Solana/replies/replyCore';
import { fetchPlainTransaction } from '../../../../../utils/solana/postReceipt';
import { saveVerifiedReply } from '../../../../../utils/solana/replyStore';
import { ACTION_HEADERS, actionJson, originFrom } from '../../../actionHeaders';
import { resolveSolanaPostAuthor, solanaConnection } from '../../../solanaPostAuthor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RPC potrafi znac transakcje dopiero chwile po potwierdzeniu u klienta. */
const FETCH_ATTEMPTS = 4;
const FETCH_INTERVAL_MS = 1500;

type Failure = Extract<ReplyCheck, { ok: false }>['reason'];

const MESSAGES: Record<Failure, string> = {
  'failed-tx': 'This transaction failed on-chain, so there is no reply to post.',
  'self-reply': 'You wrote this post - a reply that tips yourself is not shown as a paid reply.',
  'wrong-payer': 'This transaction was signed by a different wallet.',
  'no-reply-memo': 'This transaction does not carry a MySphere reply.',
  'wrong-post': 'This reply belongs to a different post.',
  'bad-text': 'The reply text on-chain is empty or malformed.',
  'no-tip': 'This transaction does not tip the author.',
  'tip-wrong-recipient': 'The tip in this transaction does not go to the author of this post.',
  'tip-too-small': 'The tip in this transaction is below the minimum for a reply.',
};

export type ConfirmStatus = 'saved' | 'pending' | 'rejected';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTION_HEADERS });
}

export async function POST(request: Request, { params }: { params: { postId: string } }) {
  const url = new URL(request.url);
  const origin = originFrom(request);
  // encodeURIComponent: odpowiedz "rejected" dla smieciowego ID idzie PRZED
  // walidacja, a ikona nie moze wtedy stac sie innym adresem.
  const icon = `${origin}/post/${encodeURIComponent(params.postId)}/opengraph-image`;

  let body: { account?: unknown; signature?: unknown; type?: unknown } = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object') body = parsed;
  } catch {
    /* link "Retry saving" niesie podpis w adresie - cialo moze byc puste */
  }

  // Callback lancucha i nasza strona zawsze niosa podpis w ciele. Bez niego
  // to link "Retry saving" - podpis i portfel placacego sa wtedy w adresie,
  // a `account` z ciala to portfel, ktory akurat kliknal. Moze byc inny niz
  // ten, ktory zaplacil, i nie wolno mu zamienic oplaconej odpowiedzi
  // w definitywne "wrong-payer".
  const chained = typeof body.signature === 'string' && body.signature !== '';
  const signature = chained ? (body.signature as string) : url.searchParams.get('signature') ?? '';
  const rawAccount = chained ? body.account : url.searchParams.get('account');
  // Portfel jest opcjonalny: odzyskanie z wklejonego podpisu go nie zna, a
  // serwer i tak wezmie platnika z transakcji. Podany - musi sie zgadzac.
  const accountGiven = rawAccount !== undefined && rawAccount !== null && rawAccount !== '';
  const claimedAccount = accountGiven && isSolanaAddress(rawAccount) ? rawAccount : undefined;

  const respond = (action: Record<string, unknown>, message: string) =>
    actionJson(chained ? action : { type: 'post', message, links: { next: { type: 'inline', action } } });

  const completed = (status: ConfirmStatus, title: string, description: string, extra: Record<string, unknown> = {}) =>
    respond(
      {
        type: 'completed',
        status,
        icon,
        title,
        description,
        label: status === 'saved' ? 'Posted' : 'Not posted',
        ...(status === 'rejected' ? { error: { message: description } } : {}),
        ...extra,
      },
      description
    );

  const rejected = (description: string) => completed('rejected', 'Reply not posted', description);

  // Jeszcze niezapisane: przycisk ponowienia z podpisem (i portfelem) w adresie.
  const pending = (description: string, title = 'Reply paid - not saved yet') => {
    const query = new URLSearchParams({ signature });
    if (claimedAccount) query.set('account', claimedAccount);
    return respond(
      {
        type: 'action',
        status: 'pending' satisfies ConfirmStatus,
        icon,
        title,
        description: `${description} Recover it any time at ${origin}/blink/reply/${params.postId}?${query}`,
        label: 'Retry saving',
        links: {
          actions: [
            {
              type: 'post',
              label: 'Retry saving',
              href: `/api/actions/reply/${params.postId}/confirm?${query}`,
            },
          ],
        },
      },
      `${title}. ${description}`
    );
  };

  // Tanie sprawdzenia formatu PRZED jakimkolwiek odczytem Firestore albo RPC -
  // smieci nie maja kosztowac nas limitu publicznego endpointu.
  if (!isSolanaSignature(signature)) return rejected('Missing or malformed transaction signature.');
  if (accountGiven && !claimedAccount) return rejected('That is not a valid Solana address.');
  if (!isValidPostId(params.postId)) return rejected('This post does not exist.');

  // Kazdy nieprzewidziany wyjatek dalej to 500, a 500 w callbacku lancucha
  // klient Blinka pokazuje jako SUKCES poprzedniego kroku (patrz naglowek).
  // Oplacona odpowiedz dostaje wtedy "pending" z ponowieniem, nie cisze.
  try {
    return await confirmPaidReply();
  } catch (error) {
    console.error('[actions/reply/confirm] Nieoczekiwany blad:', error);
    return pending('Something went wrong on our side while saving - nothing is lost.');
  }

  async function confirmPaidReply(): Promise<Response> {
    const connection = solanaConnection();

    // Jedno pytanie o status zamiast ~4,5 s petli getTransaction dla podpisu,
    // o ktorym siec nic nie wie: nieznany podpis odpowiada od razu.
    let status;
    try {
      status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    } catch (error) {
      console.error('[actions/reply/confirm] Nie udalo sie odczytac statusu podpisu:', error);
      return pending('We could not reach the chain just now - nothing is lost.');
    }
    if (!status) {
      return pending(
        'The network has not shown us this transaction yet. If it never lands, nothing was charged.',
        'Reply not saved yet'
      );
    }
    // Blad na poziomie `processed` to jeszcze nie wyrok: ten blok moze wypasc
    // z lancucha, a "rejected" jest ostateczne - nasza strona kasuje wtedy
    // podpis z pamieci. Taki przypadek idzie dalej do getTransaction
    // (`confirmed`), ktory albo potwierdzi blad, albo da "pending".
    if (status.err && status.confirmationStatus !== 'processed') return rejected(MESSAGES['failed-tx']);

    const resolved = await resolveSolanaPostAuthor(params.postId);
    if (!resolved.ok) {
      // 4xx z resolvera to decyzja (post nie istnieje, kwit nie pasuje);
      // 5xx to chwilowa awaria - odpowiedz jest oplacona, wiec dajemy ponowienie.
      return resolved.status >= 500
        ? pending('We could not reach the chain or our database just now.')
        : rejected(resolved.error);
    }

    let fetched = null;
    for (let attempt = 0; attempt < FETCH_ATTEMPTS && !fetched; attempt += 1) {
      if (attempt > 0) await new Promise(r => setTimeout(r, FETCH_INTERVAL_MS));
      fetched = await fetchPlainTransaction(connection, signature).catch(() => null);
    }
    if (!fetched) {
      return pending('The network has not confirmed this reply to us yet - nothing is lost.');
    }

    // Bez podanego portfela odpowiadajacym jest platnik oplaty. Straz przed
    // odpowiedzia "samemu sobie" dziala wtedy dalej (platnik == autor), a
    // "wrong-payer" ma sens tylko, gdy ktos portfel podal.
    const account = claimedAccount ?? fetched.plain.feePayer;
    const check = verifyReplyTransaction(
      { ...fetched.plain, failed: fetched.failed },
      { postId: resolved.post.id, account, authorWallet: resolved.wallet.toBase58() }
    );
    if (!check.ok) return rejected(MESSAGES[check.reason]);

    let saved;
    try {
      saved = await saveVerifiedReply({
        postId: resolved.post.id,
        signature,
        author: account,
        text: check.text,
        lamports: check.lamports,
      });
    } catch (error) {
      console.error('[actions/reply/confirm] Zapis komentarza nie powiodl sie:', error);
      return pending('Your reply is paid and on-chain, but saving it failed.');
    }
    if (saved === 'unavailable') {
      return pending('Your reply is paid and on-chain, but replies cannot be saved right now.');
    }

    // Udostepniona strona posta jest cache'owana (ISR) - bez tego swiezo
    // zapisana odpowiedz pojawilaby sie tam dopiero po kilku minutach.
    try {
      revalidatePath(`/post/${resolved.post.id}`);
    } catch {
      /* rewalidacja to przyspieszenie, nie warunek zapisu */
    }

    return completed(
      'saved',
      'Reply posted',
      `Your reply is live under the post on MySphere: ${origin}/post/${resolved.post.id}`,
      // Kwota Z LANCUCHA (lamporty jako string, u64) - nasza strona pokazuje
      // ja zamiast kwoty wybranej w formularzu, ktorej przy wznowieniu po
      // odswiezeniu albo przy odzyskaniu z podpisu w ogole nie zna.
      { tipLamports: check.lamports.toString() }
    );
  }
}
