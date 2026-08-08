import { doc, getDoc } from 'firebase/firestore';
import { getPublicDb as getDb } from '../publicFirestore';
import { toMillis } from '../firestoreTime';
import { perAnswerFor, type Ask } from './types';

/**
 * Odczyt POJEDYNCZEGO Aska po stronie serwera - na potrzeby udostepnialnej
 * trasy /ask/[id] i generowanej dla niej karty OG.
 *
 * ===========================================================================
 * PO CO TA TRASA W OGOLE POWSTALA
 * ===========================================================================
 * Ask byl jedynym wlasnym obiektem tego produktu BEZ ADRESU. Post ma
 * /post/[id], napiwek ma /tip/[txHash], czlowiek ma /u/[address] - kazde
 * z wlasna karta podgladu. Aska nie dalo sie nawet zalinkowac: mozna bylo
 * wyslac komus /asks i kazac szukac.
 *
 * To boli podwojnie, bo Ask jest OFERTA PRACY z terminem. Jego cala wartosc
 * polega na tym, ze dotrze do kogos, kto potrafi odpowiedziec - a dotrzec moze
 * tylko wtedy, gdy da sie go wkleic.
 *
 * ===========================================================================
 * DLACZEGO OSOBNY PLIK, A NIE asks.ts
 * ===========================================================================
 * `asks.ts` jest modulem KLIENCKIM: ciagnie kliencki SDK, cache w localStorage
 * i logike kompozytora. Tutaj potrzebny jest jeden odczyt wykonywany na
 * serwerze, wiec bierzemy minimalny zestaw - dokladnie tak, jak
 * `getPostForShare.ts` robi to dla postow.
 *
 * Mapowanie jest CELOWO takie samo jak `toAsk` w asks.ts, razem z liczeniem
 * `perAnswer` z budzetu i miejsc zamiast czytania zapisanego pola. Gdyby te
 * dwa mapowania sie rozjechaly, ta sama karta pokazywalaby inna kwote
 * w feedzie i po wklejeniu linku.
 *
 * To sa dane PUBLICZNE: tresc pytania, budzet i termin widzi kazdy
 * w feedzie. Zapieczetowane sa ODPOWIEDZI, a tych ten odczyt nie dotyka.
 */

const ASKS = 'asks';

export async function getAskForShare(askId: string): Promise<Ask | null> {
  const id = askId?.trim();
  if (!id) return null;

  try {
    const snapshot = await getDoc(doc(getDb(), ASKS, id));
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as Record<string, any>;
    const budget = Number(data.budget) || 0;
    const seats = Number(data.seats) || 0;

    return {
      id: snapshot.id,
      author: typeof data.author === 'string' ? data.author : '',
      question: typeof data.question === 'string' ? data.question : '',
      budget,
      seats,
      perAnswer: perAnswerFor(budget, seats),
      token: typeof data.token === 'string' ? data.token : 'USDC',
      network: typeof data.network === 'string' ? data.network : 'base',
      deadline: toMillis(data.deadline),
      createdAt: toMillis(data.createdAt),
      status: data.status === 'resolved' || data.status === 'expired' ? data.status : 'open',
      funding: data.funding === 'escrowed' ? 'escrowed' : 'on-resolve',
      answerCount: Number(data.answerCount) || 0,
      acceptedCount: Number(data.acceptedCount) || 0,
      resolvedAt: data.resolvedAt ? toMillis(data.resolvedAt) : undefined,
      escrowTxHash: typeof data.escrowTxHash === 'string' ? data.escrowTxHash : null,
      escrowChainId: typeof data.escrowChainId === 'number' ? data.escrowChainId : null,
      escrowResolveTxHash:
        typeof data.escrowResolveTxHash === 'string' ? data.escrowResolveTxHash : null,
    };
  } catch (error) {
    // `null` znaczy tu "nie mamy czego pokazac" i wolajacy robi z tego 404.
    // Rzucenie wywalaloby cala trase, a nieudany odczyt jednego dokumentu nie
    // jest awaria warta pustej strony bledu.
    console.error('[ask-share] Odczyt Aska nie powiodl sie:', error);
    return null;
  }
}

/** Skrot adresu dla naglowka. Ten sam ksztalt co przy postach. */
export function shortAskAuthor(address: string): string {
  if (!address || address.length < 10) return address || 'unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
