import { toMillis } from '../firestoreTime';
import { perAnswerFor, type Ask, type AskAnswer } from './types';

/**
 * Mapowanie surowych dokumentow Firestore na typy Aska - CZYSTE, bez SDK.
 *
 * === DLACZEGO OSOBNY PLIK ===
 * Te dwie funkcje siedzialy w asks.ts, ktory importuje KLIENCKI SDK Firestore
 * (app/utils/firebase). Serwer (app/api/asks/askStore.ts, firebase-admin)
 * potrzebuje dokladnie tego samego mapowania dla Askow bez zapieczetowanego
 * stanu ("legacy") - a gdyby importowal asks.ts, ciagnalby do trasy caly
 * kliencki SDK i jego inicjalizacje. Drugiej kopii mapowania tez nie chcemy:
 * dwie kopie to dwa miejsca, w ktorych "resolved" zaczyna znaczyc co innego.
 *
 * Plik nie ma zadnych importow poza czystymi helperami, wiec laduje go takze
 * mocha (test/asksSeals.test.ts) bez Nexta i bez Firebase.
 *
 * asks.ts re-eksportuje obie funkcje, wiec dotychczasowi wolajacy nie
 * zmieniaja importow.
 */

/** Mapowanie dokumentu na Aska. Znaczniki przez toMillis - patrz firestoreTime. */
export function toAsk(id: string, data: Record<string, any>): Ask {
  const budget = Number(data.budget) || 0;
  const seats = Number(data.seats) || 0;
  return {
    id,
    author: typeof data.author === 'string' ? data.author : '',
    question: typeof data.question === 'string' ? data.question : '',
    budget,
    seats,
    // Liczymy z budzetu i miejsc, a nie czytamy zapisanej wartosci: gdyby
    // kiedys rozjechala sie z budzetem, karta obiecywalaby inna kwote, niz
    // wyplaci rozstrzygniecie.
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
}

/**
 * Odpowiedzi BEZ TRESCI - metadane, ktore wolno pokazac kazdemu.
 *
 * Liczba odpowiedzi jest jawna celowo: karta ma pokazywac "7 answers sealed
 * until resolve". Jawne jest TO, ZE ktos odpowiedzial; niejawne CO napisal.
 */
export function toAnswerMeta(id: string, data: Record<string, any>): AskAnswer {
  return {
    id,
    askId: typeof data.askId === 'string' ? data.askId : '',
    author: typeof data.author === 'string' ? data.author : '',
    createdAt: toMillis(data.createdAt),
    content: null, // zapieczetowane - tresc wydaje wylacznie trasa serwerowa
    accepted: Boolean(data.accepted),
    payoutTxHash: typeof data.payoutTxHash === 'string' ? data.payoutTxHash : null,
    // Kwota zapisana w chwili przyjecia. `null` znaczy "nie wiadomo ile",
    // a nie "zero" - patrz komentarz przy tych polach w types.ts.
    payoutAmount: typeof data.payoutAmount === 'number' ? data.payoutAmount : null,
    payoutToken: typeof data.payoutToken === 'string' ? data.payoutToken : null,
    payoutNetwork: typeof data.payoutNetwork === 'string' ? data.payoutNetwork : null,
  };
}
