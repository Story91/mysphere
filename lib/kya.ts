/**
 * "KYA" W MYSPHERE - WARSTWA ZGODNOSCI NAD WLASNYM REJESTREM AGENTOW.
 *
 * KYA JAKO ZEWNETRZNA USLUGA NIE ISTNIEJE. Stan zweryfikowany 5 sierpnia 2026:
 *  - `kya-api.registr.ai` zwraca NXDOMAIN (brak rekordu DNS, a nie chwilowa
 *    awaria),
 *  - `registr.ai` nie odpowiada,
 *  - `@registrai/kya` zostal wycofany z npm,
 *  - Registrai spivotowalo na oracle/atestacje.
 * `vendor/kya/index.js` sam pisze w naglowku, ze jest REKONSTRUKCJA API z
 * `docs/KYA.md`, napisana po to, zeby build przechodzil. Kazde wywolanie tego
 * klienta konczylo sie bledem sieciowym, wiec caly modul agentow pokazywal
 * dane z uslugi, ktorej nie ma.
 *
 * DLATEGO: to jest WLASNA IMPLEMENTACJA. Wszystkie ponizsze metody czytaja i
 * pisza do rejestru MySphere w Firestore (`app/utils/agents/registry.ts`).
 * Nie ma tu ani jednego zapytania HTTP na zewnatrz.
 *
 * `vendor/kya` ZOSTAJE - jako referencja ksztaltu API. Komponenty w
 * `app/MyAgents/components/` nadal importuja stamtad TYPY, a ten plik zachowuje
 * dotychczasowa sygnature obiektu `kya` (`listAgents`, `getAgent`,
 * `isAgentTrusted`, `getReputation` i reszta), zeby zaden konsument nie
 * wymagal przerobki.
 *
 * CO SIE ZMIENILO W ZACHOWANIU:
 *  - brak agentow w kolekcji = puste listy i `trusted: false`, bez wyjatkow,
 *  - `buildFeedbackTx()` nie buduje juz wywolania kontraktu ERC-8004 (zadnego
 *    nie mamy) - szczegoly przy samej metodzie.
 */

import {
  getAgent as registryGetAgent,
  getAgentFeedback,
  getRegistryStats,
  isAgentTrusted as registryIsAgentTrusted,
  listAgents as registryListAgents,
  submitFeedback as registrySubmitFeedback,
  computeReputationHistory,
  getReputation as registryGetReputation,
  normalizeAgentAddress,
} from '@/app/utils/agents/registry';
import type {
  AgentFeedbackRecord,
  AgentRecord,
  AgentReputation,
  AgentReputationSnapshot,
  AgentTrustCheck,
} from '@/app/utils/agents/types';

/** Opcje listowania w starym, stronicowanym ksztalcie KYA. */
export interface KyaListAgentsOptions {
  page?: number;
  limit?: number;
  network?: 'mainnet' | 'testnet' | string;
  chain?: string;
}

export interface KyaPaginationOptions {
  page?: number;
  limit?: number;
}

export interface KyaBuildFeedbackTxParams {
  chainId: number;
  value: string;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  feedbackHash?: string;
}

export interface KyaFeedbackTxData {
  to: string;
  data: string;
  chainId: number;
}

export interface KyaSubmitFeedbackParams {
  chainId: number;
  commenterAddress: string;
  score: number;
  tag?: string;
  comment?: string;
  commentHash?: string;
  txHash?: string;
}

const ZERO_CALLDATA = '0x';

/**
 * Emulacja stronicowania po numerze strony na kursorowym API rejestru.
 * Firestore nie ma offsetu, wiec strone N osiagamy przechodzac kursorem przez
 * strony 1..N. Placa za to tylko starzy konsumenci - hooki w
 * `app/MyAgents/hooks/` chodza juz po kursorze.
 */
async function listAgentsByPage(options: KyaListAgentsOptions): Promise<AgentRecord[]> {
  const pageSize = options.limit ?? 24;
  const targetPage = Math.max(1, options.page ?? 1);
  const network = options.network === 'testnet' ? 'testnet' : 'mainnet';

  let cursor: number | null = null;
  let items: AgentRecord[] = [];

  for (let page = 1; page <= targetPage; page++) {
    const result = await registryListAgents({
      limit: pageSize,
      cursor,
      network,
      chain: options.chain,
    });
    items = result.items;
    cursor = result.nextCursor;
    if (!result.hasMore) break;
  }

  return items;
}

export const kya = {
  /** Agent po adresie. Zwraca null, gdy nie ma go w rejestrze. */
  getAgent(id: string): Promise<AgentRecord | null> {
    return registryGetAgent(id);
  },

  /** Sprawdzenie progow zaufania (domyslnie score >= 50 i >= 3 opinie). */
  isAgentTrusted(
    id: string,
    opts: { minScore?: number; minFeedback?: number } = {}
  ): Promise<AgentTrustCheck> {
    return registryIsAgentTrusted(id, opts);
  },

  /** Reputacja zbiorcza + w rozbiciu na lancuchy. */
  getReputation(id: string): Promise<AgentReputation> {
    return registryGetReputation(id);
  },

  /**
   * Historia reputacji. Nie trzymamy osobnych migawek - wykres to srednia
   * kroczaca liczona z opinii, ktore i tak sa w Firestore.
   */
  async getReputationHistory(
    id: string,
    opts: KyaPaginationOptions = {}
  ): Promise<AgentReputationSnapshot[]> {
    const feedback = await getAgentFeedback(id);
    return computeReputationHistory(feedback, opts.limit ?? 30);
  },

  /**
   * "Transakcja opinii".
   *
   * KYA budowalo tu wywolanie kontraktu ERC-8004. Takiego kontraktu nie mamy i
   * nie bedziemy udawac, ze mamy. Zamiast tego zwracamy transakcje na 0 ETH na
   * adres agenta, z hashem opinii w calldata: to realny, podpisany przez autora
   * opinii i datowany slad on-chain, do ktorego linkuje `FeedbackList`. Sama
   * tresc opinii oraz reputacja zyja w rejestrze MySphere.
   */
  async buildFeedbackTx(id: string, params: KyaBuildFeedbackTxParams): Promise<KyaFeedbackTxData> {
    const agent = await registryGetAgent(id);
    const to = agent?.ownerAddress || normalizeAgentAddress(id);
    if (!to) throw new Error('Agent is not registered in the MySphere registry');

    return {
      to,
      data: params.feedbackHash || ZERO_CALLDATA,
      chainId: params.chainId,
    };
  },

  /** Zapis opinii + aktualizacja reputacji agenta (jedna transakcja Firestore). */
  submitFeedback(id: string, params: KyaSubmitFeedbackParams): Promise<AgentFeedbackRecord> {
    return registrySubmitFeedback({
      agentAddress: id,
      commenterAddress: params.commenterAddress,
      score: params.score,
      tag: params.tag,
      comment: params.comment,
      commentHash: params.commentHash,
      txHash: params.txHash,
      chainId: params.chainId,
    });
  },

  /** Opinie o agencie, stronicowane po stronie klienta. */
  async getFeedback(id: string, opts: KyaPaginationOptions = {}): Promise<AgentFeedbackRecord[]> {
    const pageSize = opts.limit ?? 10;
    const page = Math.max(1, opts.page ?? 1);
    const all = await getAgentFeedback(id);
    return all.slice((page - 1) * pageSize, page * pageSize);
  },

  /** Lista agentow w starym, stronicowanym ksztalcie. */
  listAgents(opts: KyaListAgentsOptions = {}): Promise<AgentRecord[]> {
    return listAgentsByPage(opts);
  },

  /** Statystyki rejestru dla paska na /MyAgents. */
  async getStats(_opts: { network?: string } = {}) {
    const stats = await getRegistryStats();
    return {
      totalAgents: stats.totalAgents,
      totalFeedback: stats.totalFeedback,
      totalChains: stats.totalChains,
      trustedPercent: stats.trustedPercent,
      trustedAgents: stats.trustedAgents,
    };
  },
};

export default kya;
