"use client";

/**
 * useAgentLookup - rozstrzyga, ktore adresy autorow w feedzie naleza do
 * zarejestrowanych agentow.
 *
 * DLACZEGO NIE ZAPYTANIE PER POST:
 * feed renderuje do 150 postow. Gdyby kazda odznaka odpytywala rejestr osobno
 * (tak robi app/MyAgents/components/KYATrustBadge.tsx), bylo by to 150 zapytan
 * na jedno wejscie do czatu. To ten sam problem, ktory rozwiazal
 * getBulkPostTipStats() dla statystyk tipow.
 *
 * CO SIE ZMIENILO:
 * wczesniej pobieralismy CALY rejestr (listAgents stronicowane, limit 5 stron)
 * i indeksowalismy go lokalnie - bo KYA nie mialo zapytania zbiorczego, a
 * chunkowanie po 30 nic by nie dalo przy API tylko-po-jednym-id. Teraz rejestr
 * jest nasz i ma getAgentsByAddresses(), wiec pytamy WYLACZNIE o adresy
 * autorow widocznych w feedzie, chunkami po 30 (limit Firestore na `in`):
 *   - 150 unikalnych autorow = najwyzej 5 zapytan, zwykle mniej,
 *   - liczba zapytan zalezy od liczby unikalnych ADRESOW, nie od liczby postow,
 *   - nie sciagamy juz agentow, ktorych w feedzie nie ma.
 *
 * SCROLLOWANIE NIE REFETCHUJE:
 * klucz TanStack Query zalezy od adresow (posortowana, zdeduplikowana lista),
 * wiec dociagniecie kolejnej strony feedu tworzy NOWY klucz. Zeby nie znaczylo
 * to ponownego pobierania wszystkiego, rozstrzygniete adresy siedza w cache'u
 * modulu - zapytanie sieciowe idzie tylko po adresy jeszcze NIEZNANE. Kazdy
 * adres jest wiec pobierany raz na TTL, niezaleznie od tego, ile razy klucz sie
 * zmieni. Do tego keepPreviousData, zeby odznaki nie mrugaly przy zmianie klucza.
 *
 * GDY REJESTR JEST PUSTY ALBO NIEDOSTEPNY:
 * zapytanie zwraca pusta mape (registry.ts lapie bledy i loguje raz na sesje),
 * `getAgent()` daje null, a AgentBadge nie renderuje niczego. Feed wyglada
 * dokladnie jak dzis.
 */

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getAgentsByAddresses,
  isAgentAddress,
  TRUST_MIN_FEEDBACK as REGISTRY_MIN_FEEDBACK,
  TRUST_MIN_SCORE as REGISTRY_MIN_SCORE,
} from "@/app/utils/agents/registry";
import type { AgentRecord } from "@/app/utils/agents/types";

/** Progi zaufania - re-eksport z rejestru, zeby konsumenci mieli jedno zrodlo. */
export const TRUST_MIN_SCORE = REGISTRY_MIN_SCORE;
export const TRUST_MIN_FEEDBACK = REGISTRY_MIN_FEEDBACK;

/** Jak dlugo rozstrzygniecie adresu jest wazne bez ponownego pytania. */
const LOOKUP_TTL_MS = 5 * 60_000;

export interface AgentInfo {
  /** Identyfikator agenta - uzywany w linku do profilu. */
  agentId: string;
  /** Adres wlasciciela (lowercase). */
  ownerAddress: string;
  /** Znormalizowany trust score (0..100) albo null, gdy brak ocen. */
  score: number | null;
  /** Liczba ocen skladajacych sie na score. */
  feedbackCount: number;
  /** Czy agent przekracza progi zaufania. */
  trusted: boolean;
}

export interface AgentLookupResult {
  /** Mapa: adres (lowercase) -> dane agenta. Tylko adresy z feedu. */
  agents: Record<string, AgentInfo>;
  /** Trwa rozstrzyganie adresow. */
  loading: boolean;
  /** Rejestr odpowiedzial. Gdy false - nie renderujemy nic. */
  resolved: boolean;
  /** Wygodny akcesor dla pojedynczego adresu. */
  getAgent: (address?: string | null) => AgentInfo | null;
}

const EMPTY_AGENTS: Record<string, AgentInfo> = {};

/**
 * Cache rozstrzygniec na poziomie MODULU, a nie komponentu.
 * `null` w polu `info` znaczy "sprawdzone, to nie jest agent" - to rownie
 * wartosciowa informacja, co trafienie, i tez nie chcemy jej pytac dwa razy.
 */
type LookupEntry = { info: AgentInfo | null; at: number };
const lookupCache = new Map<string, LookupEntry>();

function toAgentInfo(record: AgentRecord): AgentInfo {
  const score = typeof record.score === "number" ? record.score : null;
  const feedbackCount = record.feedbackCount ?? 0;
  return {
    agentId: record.masterAgentId || record.address,
    ownerAddress: record.ownerAddress || record.address,
    score,
    feedbackCount,
    trusted: record.trusted ?? false,
  };
}

/**
 * Pyta rejestr WYLACZNIE o adresy, ktorych nie ma w cache'u (albo ktore sie
 * przeterminowaly), a wynik sklada z cache'u dla calego zestawu.
 */
async function resolveAddresses(addresses: string[]): Promise<Record<string, AgentInfo>> {
  const now = Date.now();
  const missing = addresses.filter((address) => {
    const entry = lookupCache.get(address);
    return !entry || now - entry.at > LOOKUP_TTL_MS;
  });

  if (missing.length > 0) {
    // Chunkowanie po 30 siedzi w getAgentsByAddresses.
    const found = await getAgentsByAddresses(missing);
    const at = Date.now();
    for (const address of missing) {
      const record = found[address];
      lookupCache.set(address, { info: record ? toAgentInfo(record) : null, at });
    }
  }

  const result: Record<string, AgentInfo> = {};
  for (const address of addresses) {
    const entry = lookupCache.get(address);
    if (entry?.info) result[address] = entry.info;
  }
  return result;
}

/**
 * @param addresses adresy autorow z feedu. Wchodza do klucza zapytania w
 *   postaci posortowanej i zdeduplikowanej listy, wiec te same posty w innej
 *   kolejnosci to ten sam klucz.
 */
export function useAgentLookup(addresses: string[] = []): AgentLookupResult {
  // Stabilny klucz - inaczej nowa tablica adresow przy kazdym renderze
  // PostList unizewalnialaby zapytanie bez potrzeby.
  const uniqueAddresses = useMemo(() => {
    const unique = Array.from(
      new Set(addresses.filter(isAgentAddress).map((address) => address.trim().toLowerCase()))
    );
    unique.sort();
    return unique;
  }, [addresses]);

  const addressKey = uniqueAddresses.join(",");

  const { data, isPending, isSuccess } = useQuery({
    queryKey: ["agents", "lookup", addressKey],
    queryFn: () => resolveAddresses(uniqueAddresses),
    enabled: uniqueAddresses.length > 0,
    staleTime: LOOKUP_TTL_MS,
    gcTime: 30 * 60_000,
    // Rejestr bywa niedostepny (np. brak regul Firestore) - dobijanie sie nic
    // nie da, a feed ma dzialac bez odznak.
    retry: 0,
    refetchOnWindowFocus: false,
    // Poprzedni wynik zostaje na ekranie, gdy klucz sie zmienia przy scrollu.
    placeholderData: keepPreviousData,
  });

  const agents = data ?? EMPTY_AGENTS;

  const getAgent = useMemo(() => {
    return (address?: string | null): AgentInfo | null => {
      if (!address) return null;
      return agents[address.trim().toLowerCase()] ?? null;
    };
  }, [agents]);

  return {
    agents,
    loading: uniqueAddresses.length > 0 && isPending,
    resolved: isSuccess,
    getAgent,
  };
}
