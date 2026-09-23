/**
 * WYPLATA ZA ODPOWIEDZ NA ASKU SOL - jedna transakcja: Memo v2 + przelew SOL.
 *
 * ===========================================================================
 * JEDYNY PLIK KLIENTA ASKOW Z @solana/web3.js
 * ===========================================================================
 * Ladowany WYLACZNIE przez `await import('./solanaAskPay')` w chwili klikniecia
 * "Pay … SOL and accept" (app/asks/AsksContent.tsx). Statyczny import tego pliku
 * gdziekolwiek w komponentach Askow wciagnalby web3.js do glownego bundla feedu -
 * pilnuje tego test/askSolanaUi.test.ts (straznik bundla).
 *
 * ===========================================================================
 * CO NIESIE TRANSAKCJA I DLACZEGO
 * ===========================================================================
 *   1. Memo v2 `mysphere:ask|v1|<askId>|<answerId>` z PLATNIKIEM jako
 *      podpisujacym kontem. Memo v2 wymaga podpisu kazdego podanego konta, wiec
 *      serwer wie, ze memo zlozyl wlasciciel portfela, z ktorego ida pieniadze.
 *      Bez memo przelew autor -> odpowiadajacy nie mowi, ZA CO zaplacono.
 *   2. SystemProgram.transfer platnik -> odbiorca, dokladnie `lamports`.
 *
 * Kwota i odbiorca przychodza od wolajacego, a ten bierze je z serwera
 * (GET /api/asks/[id]/answers: rail.perAnswerLamports i payoutAddress) - nigdy
 * z lustra Aska w Firestore. Serwer i tak sprawdzi transakcje na lancuchu
 * (verifySolanaAskPayout) i odrzuci kazda inna kwote, odbiorce albo memo.
 *
 * ===========================================================================
 * PODPIS WRACA ZANIM WIEMY, CZY TRANSAKCJA WESZLA
 * ===========================================================================
 * `onSent` dostaje podpis zaraz po wyslaniu - wolajacy zapisuje go PRZED
 * potwierdzeniem i przed POST accept. Pieniadze moga juz isc, wiec utrata
 * podpisu kosztowalaby autora drugi przelew za te sama odpowiedz.
 */

import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
// Jawny import z 'buffer', a NIE globalny `Buffer`: w bundlu przegladarkowym
// Next.js globalnego Buffera nie ma (ten sam wzorzec co SolanaPostButton.tsx).
import { Buffer } from 'buffer';
import type { SolanaSigner } from '../../components/solana/solanaWalletTypes';
import { MEMO_PROGRAM_ADDRESS } from '../../basechat/Solana/config/solanaChain';
import { confirmOrAskChain } from '../../basechat/Solana/confirm';
import { buildAskPayoutMemo, isLamportsString, MIN_PER_ANSWER_LAMPORTS } from './solAmounts';

export type SolanaAskPayInput = {
  signer: SolanaSigner;
  askId: string;
  answerId: string;
  /** Odbiorca z serwera (payoutAddress), base58. */
  payee: string;
  /** Kwota z serwera (rail.perAnswerLamports), lamporty dziesietnie. */
  lamports: string;
  /**
   * Oczekiwany platnik (solanaPayer z serwera). Podpisujacy portfel musi byc
   * dokladnie nim - inaczej serwer odrzuci wyplate (wrong-sender), a pieniadze
   * juz by poszly.
   */
  expectedPayer: string;
  /** Wolane zaraz po wyslaniu, PRZED potwierdzeniem. */
  onSent?: (signature: string) => void;
};

export type SolanaAskPayOutcome =
  /** Na lancuchu, bez bledu. */
  | { kind: 'landed'; signature: string }
  /** Na lancuchu, ale z bledem - pieniadze nie wyszly (poza oplata). */
  | { kind: 'failed'; signature: string; detail: string }
  /** Okno wygaslo, RPC odpowiadal i podpisu nie ma - transakcja nie weszla. */
  | { kind: 'expired'; signature: string }
  /** RPC milczal - nie wiemy. Podpis trzeba zachowac i sprawdzic. */
  | { kind: 'unknown'; signature: string };

/**
 * Buduje, wysyla i potwierdza wyplate. Rzuca PRZED wyslaniem przy zlych
 * danych albo innym portfelu (nic nie wyszlo) i gdy portfel odmowi podpisu.
 */
export async function payAskAnswerInSol(input: SolanaAskPayInput): Promise<SolanaAskPayOutcome> {
  const { signer, askId, answerId, payee, lamports, expectedPayer, onSent } = input;

  if (!isLamportsString(lamports) || BigInt(lamports) < MIN_PER_ANSWER_LAMPORTS) {
    throw new Error('The amount for this answer is not valid, so nothing was sent.');
  }

  const payer = signer.publicKey;
  // base58 - porownanie dokladne, bez zmiany wielkosci liter.
  if (payer.toBase58() !== expectedPayer) {
    throw new Error(
      'The connected Solana wallet is not the one this Ask pays from. Switch wallets - nothing was sent.'
    );
  }

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(payee);
  } catch {
    throw new Error('The payout address for this answer is not a valid Solana address. Nothing was sent.');
  }
  if (recipient.equals(payer)) {
    throw new Error('This answer pays out to your own wallet. Nothing was sent.');
  }

  const memo = buildAskPayoutMemo(askId, answerId);
  const transaction = new Transaction()
    .add(
      new TransactionInstruction({
        // Platnik jako PODPISUJACE konto memo - Memo v2 odrzuca konto bez
        // podpisu, wiec to jest dowod, ze memo zlozyl wlasciciel pieniedzy.
        keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
        programId: new PublicKey(MEMO_PROGRAM_ADDRESS),
        data: Buffer.from(memo, 'utf8'),
      })
    )
    .add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: recipient,
        lamports: BigInt(lamports),
      })
    );

  const { connection, sendTransaction } = signer;
  // Blockhash RAZ, do wyslania i do potwierdzenia - patrz naglowek confirm.ts.
  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = payer;

  const signature = await sendTransaction(transaction, connection);
  onSent?.(signature);

  const outcome = await confirmOrAskChain(connection, signature, latest.blockhash, latest.lastValidBlockHeight);
  if (outcome.kind === 'failed') return { kind: 'failed', signature, detail: outcome.detail };
  return { kind: outcome.kind, signature };
}
