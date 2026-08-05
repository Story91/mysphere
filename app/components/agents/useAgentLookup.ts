"use client";

/**
 * useAgentLookup - rozstrzyga, ktore adresy autorow w feedzie naleza do
 * zarejestrowanych agentow KYA.
 *
 * DLACZEGO NIE ZAPYTANIE PER POST:
 * feed renderuje do 150 postow. Gdyby kazda odznaka wolala kya.getAgent()
 * albo kya.isAgentTrusted() (tak robi app/MyAgents/components/KYATrustBadge.tsx),
 * bylo by to 150 zapytan HTTP na jedno wejscie do czatu. To ten sam problem,
 * ktory rozwiazal getBulkPostTipStats() dla statystyk tipow.
 *
 * JAK TO ROZWIAZANE:
 * KYA nie ma endpointu zbiorczego - vendor/kya/index.js wystawia tylko
 * getAgent(id) dla POJEDYNCZEGO id. Chunkowanie po ~30 adresow nic by nie
 * dalo, bo to nadal 150 osobnych zadan, tylko puszczonych partiami.
 * Zamiast tego pobieramy RAZ caly rejestr agentow przez listAgents() i
 * dopasowujemy adresy autorow lokalnie. Kluczem TanStack Query jest stala
 * (nie zalezy od adresow), wiec:
 *   - feed ze 150 postow = 1 zapytanie sieciowe (albo kilka stron rejestru,
 *     jesli agentow jest wiecej niz REGISTRY_PAGE_SIZE - patrz MAX_PAGES),
 *   - liczba zapytan zalezy od wielkosci rejestru, NIE od liczby postow,
 *   - wynik jest wspoldzielony przez wszystkie komponenty i cache'owany.
 *
 * GDY KYA NIE ODPOWIADA:
 * zapytanie konczy sie bledem, `resolved` zostaje false, mapa jest pusta,
 * a odznaki po prostu sie nie renderuja. Feed wyglada dokladnie jak dzis.
 * Zaden blad nie wycieka do UI ani do konsoli jako uncaught.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { kya } from "@/lib/kya";
import type { AgentSummary } from "@registrai/kya";

/** Ile agentow pobieramy na jedna strone rejestru. */
const REGISTRY_PAGE_SIZE = 100;

/**
 * Twardy limit stron. Chroni przed sytuacja, w ktorej rejestr urosnie do
 * tysiecy pozycji i pobranie go zablokuje feed. Przy tym limicie rozpoznajemy
 * do 500 agentow; agent spoza tego zakresu nie dostanie odznaki - to swiadomy
 * kompromis na rzecz stalej liczby zapytan.
 */
const MAX_PAGES = 5;

/** Progi zaufania - te same, co w app/MyAgents/components/KYATrustBadge.tsx. */
export const TRUST_MIN_SCORE = 50;
export const TRUST_MIN_FEEDBACK = 3;

export interface AgentInfo {
  /** masterAgentId - uzywany w linku do eksploratora KYA. */
  agentId: string;
  /** Adres wlasciciela (lowercase). */
  ownerAddress: string;
  /** Znormalizowany trust score albo null, gdy KYA go nie podalo. */
  score: number | null;
  /** Liczba ocen skladajacych sie na score. */
  feedbackCount: number;
  /** Czy agent przekracza progi zaufania. */
  trusted: boolean;
}

export interface AgentLookupResult {
  /** Mapa: adres (lowercase) -> dane agenta. Tylko adresy z feedu. */
  agents: Record<string, AgentInfo>;
  /** Trwa pobieranie rejestru. */
  loading: boolean;
  /** KYA odpowiedzialo poprawnie. Gdy false - nie renderujemy nic. */
  resolved: boolean;
  /** Wygodny akcesor dla pojedynczego adresu. */
  getAgent: (address?: string | null) => AgentInfo | null;
}

const EMPTY_AGENTS: Record<string, AgentInfo> = {};

/** Rozpakowuje odpowiedz listAgents - API bywa tablica albo obiektem z items/agents. */
function unwrapList(result: unknown): AgentSummary[] {
  if (Array.isArray(result)) return result as AgentSummary[];
  if (result && typeof result === "object") {
    const obj = result as { items?: AgentSummary[]; agents?: AgentSummary[] };
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.agents)) return obj.agents;
  }
  return [];
}

/** Sprowadza reputacje KYA do jednej liczby. Uwzglednia opcjonalne decimals. */
function normalizeScore(summary: AgentSummary): number | null {
  if (typeof summary.score === "number" && Number.isFinite(summary.score)) {
    return summary.score;
  }
  const rep = summary.reputation;
  if (rep && typeof rep.value === "number" && Number.isFinite(rep.value)) {
    const decimals = typeof rep.decimals === "number" ? rep.decimals : 0;
    return decimals > 0 ? rep.value / Math.pow(10, decimals) : rep.value;
  }
  return null;
}

function normalizeFeedbackCount(summary: AgentSummary): number {
  if (typeof summary.feedbackCount === "number") return summary.feedbackCount;
  const total = summary.reputation?.totalFeedbackCount;
  return typeof total === "number" ? total : 0;
}

function isAddressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Pobiera rejestr agentow i buduje indeks po adresie.
 * Zwraca mape adres(lowercase) -> AgentInfo dla CALEGO rejestru; filtrowanie
 * do adresow z feedu odbywa sie pozniej, w useMemo, bez ruchu sieciowego.
 */
async function fetchAgentRegistry(): Promise<Record<string, AgentInfo>> {
  const index: Record<string, AgentInfo> = {};

  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = unwrapList(
      await kya.listAgents({ page, limit: REGISTRY_PAGE_SIZE, network: "mainnet" })
    );

    for (const summary of batch) {
      const score = normalizeScore(summary);
      const feedbackCount = normalizeFeedbackCount(summary);
      const info: AgentInfo = {
        agentId: summary.masterAgentId || summary.ownerAddress || "",
        ownerAddress: (summary.ownerAddress || "").toLowerCase(),
        score,
        feedbackCount,
        trusted:
          score !== null && score >= TRUST_MIN_SCORE && feedbackCount >= TRUST_MIN_FEEDBACK,
      };

      // Agent moze byc rozpoznawalny po adresie wlasciciela, po masterAgentId
      // (bywa adresem) albo po adresach per-chain w identities.
      const keys: unknown[] = [summary.ownerAddress, summary.masterAgentId];
      for (const identity of summary.identities || []) keys.push(identity.agentId);

      for (const key of keys) {
        if (isAddressLike(key)) index[key.toLowerCase()] = info;
      }
    }

    // Krotsza strona niz limit oznacza koniec rejestru - nie pytamy dalej.
    if (batch.length < REGISTRY_PAGE_SIZE) break;
  }

  return index;
}

/**
 * @param addresses adresy autorow z feedu. Nie wchodza do klucza zapytania -
 *   sluza tylko do zawezenia wyniku, wiec dodanie postow nie powoduje refetchu.
 */
export function useAgentLookup(addresses: string[] = []): AgentLookupResult {
  const { data, isPending, isSuccess } = useQuery({
    // Klucz jest STALY - dzieki temu wszystkie odznaki w feedzie dzielą jedno
    // zapytanie, niezaleznie od liczby postow.
    queryKey: ["kya", "agent-registry", "mainnet"],
    queryFn: fetchAgentRegistry,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 0, // KYA bywa offline - nie ma sensu dobijac sie przy kazdym wejsciu
    refetchOnWindowFocus: false,
  });

  // Stabilny klucz do useMemo - inaczej nowa tablica adresow przy kazdym
  // renderze PostList przeliczalaby mape bez potrzeby.
  const addressKey = useMemo(() => {
    const unique = Array.from(
      new Set(addresses.filter(isAddressLike).map((a) => a.toLowerCase()))
    );
    unique.sort();
    return unique.join(",");
  }, [addresses]);

  const agents = useMemo(() => {
    if (!data) return EMPTY_AGENTS;
    if (!addressKey) return EMPTY_AGENTS;

    const scoped: Record<string, AgentInfo> = {};
    for (const address of addressKey.split(",")) {
      const hit = data[address];
      if (hit) scoped[address] = hit;
    }
    return scoped;
  }, [data, addressKey]);

  const getAgent = useMemo(() => {
    return (address?: string | null): AgentInfo | null => {
      if (!address) return null;
      return agents[address.toLowerCase()] ?? null;
    };
  }, [agents]);

  return {
    agents,
    loading: isPending,
    resolved: isSuccess,
    getAgent,
  };
}
