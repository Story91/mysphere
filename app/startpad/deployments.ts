import type { Address } from 'viem';
import { ACTIVE_LAUNCHPAD_NETWORK, ACTIVE_MARKET_ID, allDeploymentsOfChain, LAUNCHPAD_DEPLOYMENTS, LAUNCHPAD_NETWORKS, launchpadAbi, type LaunchpadDeployment, type LaunchpadNetwork } from './config';

/**
 * Z ktorego wdrozenia pochodzi token - dla stron, ktore znaja tylko jego adres
 * (strona tokena, link z zewnatrz).
 *
 * Przy jednym wdrozeniu odpowiedz jest oczywista i nie kosztuje zapytania.
 * Przy kilku pytamy `launchOf` kazde (najnowsze pierwsze, jednym multicallem)
 * i bierzemy pierwsze, ktore zna token. Wynik jest niezmienny - token nie
 * przechodzi miedzy wdrozeniami - wiec zostaje w pamieci na cala sesje.
 *
 * Null = zadne wdrozenie nie zna tego adresu (albo RPC nie odpowiedzial).
 */

type ReadClient = {
  multicall: (args: any) => Promise<Array<{ status: 'success' | 'failure'; result?: unknown }>>;
};

const known = new Map<string, LaunchpadDeployment>();

export async function resolveTokenDeployment(client: ReadClient, token: Address): Promise<LaunchpadDeployment | null> {
  if (LAUNCHPAD_DEPLOYMENTS.length === 1) return LAUNCHPAD_DEPLOYMENTS[0];
  const key = token.toLowerCase();
  const cached = known.get(key);
  if (cached) return cached;

  const results = await client.multicall({
    allowFailure: true,
    contracts: LAUNCHPAD_DEPLOYMENTS.map((d) => ({
      address: d.launchpad as Address,
      abi: launchpadAbi,
      functionName: 'launchOf' as const,
      args: [token] as const,
    })),
  });
  for (let i = 0; i < LAUNCHPAD_DEPLOYMENTS.length; i++) {
    const r = results[i];
    if (r?.status !== 'success') continue;
    // Stan 0 = ten launchpad nie zna tokena.
    if (Number((r.result as readonly unknown[])[1]) === 0) continue;
    known.set(key, LAUNCHPAD_DEPLOYMENTS[i]);
    return LAUNCHPAD_DEPLOYMENTS[i];
  }
  return null;
}

type LaunchTuple = readonly [Address, number, bigint, bigint, number, `0x${string}`];

type SingleReadClient = {
  readContract: (args: any) => Promise<unknown>;
};

/**
 * To samo dla DOWOLNEJ sieci, po stronie serwera (trasy nie maja aktywnej
 * sieci). Wdrozenia po kolei, najnowsze pierwsze; pierwsze, ktore zna token,
 * wygrywa. Blad odczytu jednego wdrozenia nie przerywa - nastepne moze znac
 * token. Null = nikt go nie zna albo nic nie odpowiedzialo.
 */
export async function findTokenLaunch(
  client: SingleReadClient,
  network: LaunchpadNetwork,
  token: Address
): Promise<{ dep: LaunchpadDeployment; launch: LaunchTuple } | null> {
  let lastError: unknown = null;
  let answered = 0;
  // Takze rynki Q - profil, logo i karta tokena perpa sa tak samo potrzebne.
  for (const dep of allDeploymentsOfChain(network)) {
    try {
      const launch = (await client.readContract({
        address: dep.launchpad as Address,
        abi: launchpadAbi,
        functionName: 'launchOf',
        args: [token],
      })) as LaunchTuple;
      answered += 1;
      if (Number(launch[1]) !== 0) return { dep, launch };
    } catch (error) {
      lastError = error;
    }
  }
  // ZADEN odczyt nie przeszedl = brak odpowiedzi, nie "nieznany token" -
  // wolajacy ma prawo to rozroznic (np. ponowic), wiec rzucamy ostatni blad.
  if (answered === 0 && lastError) throw lastError;
  return null;
}

/**
 * Rynek, do ktorego nalezy token spoza aktywnego rynku - dla strony tokena
 * otwartej z linku bez `?m=`. Zwraca id rynku Q, `null` dla rynku ETH sieci,
 * albo `undefined`, gdy nikt na tej sieci nie zna tokena.
 */
export async function findTokenMarket(client: ReadClient, token: Address): Promise<string | null | undefined> {
  const base = LAUNCHPAD_NETWORKS[ACTIVE_LAUNCHPAD_NETWORK.chain.id];
  const candidates = allDeploymentsOfChain(base).filter((d) => (d.marketId ?? null) !== ACTIVE_MARKET_ID);
  if (candidates.length === 0) return undefined;
  const results = await client.multicall({
    allowFailure: true,
    contracts: candidates.map((d) => ({
      address: d.launchpad as Address,
      abi: launchpadAbi,
      functionName: 'launchOf' as const,
      args: [token] as const,
    })),
  });
  for (let i = 0; i < candidates.length; i++) {
    const r = results[i];
    if (r?.status === 'success' && Number((r.result as readonly unknown[])[1]) !== 0) return candidates[i].marketId ?? null;
  }
  return undefined;
}
