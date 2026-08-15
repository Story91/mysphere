import { erc20Abi } from '../../startpad/config';

/**
 * SALDA HOLDEROW PROSTO Z LANCUCHA, `balanceOf` PO `balanceOf`.
 *
 * ===========================================================================
 * PO CO, SKORO SKAN LOGOW JUZ JE LICZY
 * ===========================================================================
 * Bo liczy je jako SUME ROZNIC, a suma roznic jest tyle warta, co jej
 * podstawa. Cache historii dokleja do mapy sald kolejne zeskanowane przedzialy;
 * gdy podstawa raz przepadnie (14 sierpnia 2026: wyczerpany limit odczytow
 * Firestore, naglowek bez kawalkow), zostaja same roznice i mapa nie ma juz jak
 * wrocic do prawdy - skan przyrostowy zna wylacznie NASTEPNE roznice. Na
 * tokenie GLIFE konczylo sie to krzywa z saldem minus 6,5 mln tokenow i jednym
 * holderem przy czterech kupujacych.
 *
 * `balanceOf` nie ma podstawy do stracenia. Kazdy odczyt jest bezwzgledny, wiec
 * kazdy skan naprawia to, co poprzednie zepsuly, i zadna przyszla awaria bazy
 * nie zostawi po sobie ujemnego salda.
 *
 * Skan logow zostaje tam, gdzie jest niezastapiony: mowi, KTO w ogole dotykal
 * tokena. Ile - mowi juz lancuch.
 *
 * ===========================================================================
 * DLACZEGO ALBO CALY ODCZYT, ALBO ZADEN
 * ===========================================================================
 * Mapa sald zlozona po polowie z odczytow i po polowie z niczego nie jest
 * "prawie dobra" - jest tabela holderow, ktorej brakuje wierszy, i nikt na
 * stronie nie ma jak tego zobaczyc. Jeden nieudany odczyt konczy wiec caly
 * probe wynikiem `null`, a wolajacy zostaje przy tym, co mial.
 */

/**
 * Sufit kont na jeden odczyt. Praktycznie nie dziala: token launchpada ma
 * kilkanascie do kilkuset kont. Przy wiekszym rynku obcinane jest to, co
 * najmniej wazne (patrz `balanceCandidates`), a laczna liczba posiadaczy i tak
 * idzie z indeksu, nie stad.
 */
export const MAX_BALANCE_ACCOUNTS = 1_000;

/** Ile `balanceOf` w jednym multicallu. 250 to ~8 kB calldata, z zapasem. */
const BATCH = 250;

/**
 * Klient odczytu - tylko to, czego ten modul naprawde uzywa. Celowo luzny typ:
 * `multicall` i `readContract` z viem sa generyczne po ABI i kazdy wezszy ksztalt
 * konczy sie rzutowaniem w wywolaniu.
 */
export type BalanceClient = {
  chain?: { contracts?: { multicall3?: { address?: string } } } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  multicall?: (args: any) => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (args: any) => Promise<any>;
};

/**
 * Multicall3 stoi na Base i Sepolii (jest w definicji lancucha w viem), ale nie
 * na kazdej sieci, ktora obsluguje launchpad. Brak adresu w definicji znaczy
 * odczyty pojedyncze - wolniej, tyle samo prawdy.
 */
function hasMulticall(client: BalanceClient): boolean {
  return typeof client.multicall === 'function' && Boolean(client.chain?.contracts?.multicall3?.address);
}

async function readBatch(
  client: BalanceClient,
  token: string,
  accounts: string[]
): Promise<(bigint | null)[]> {
  if (hasMulticall(client)) {
    const results = await client.multicall!({
      contracts: accounts.map((account) => ({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account],
      })),
      allowFailure: true,
    });
    return results.map((entry) =>
      entry?.status === 'success' && typeof entry.result === 'bigint' ? entry.result : null
    );
  }

  return Promise.all(
    accounts.map((account) =>
      client
        .readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
        .then((value: unknown) => (typeof value === 'bigint' ? value : null))
        .catch(() => null)
    )
  );
}

/**
 * Salda podanych kont na TERAZ. `null` znaczy "odczyt sie nie udal" - wtedy
 * wolajacy zostaje przy tym, co mial, zamiast zapisac niepelna tabele.
 *
 * Zerowych sald w wyniku nie ma: konto bez tokenow nie jest holderem, a pusty
 * wiersz tylko psulby liczniki i wybor zrodla w zakladce Holders.
 */
export async function readHolderBalances(
  client: BalanceClient,
  token: string,
  accounts: string[]
): Promise<Map<string, bigint> | null> {
  const out = new Map<string, bigint>();
  if (accounts.length === 0) return out;

  try {
    for (let start = 0; start < accounts.length; start += BATCH) {
      const batch = accounts.slice(start, start + BATCH);
      const values = await readBatch(client, token, batch);
      for (let index = 0; index < batch.length; index += 1) {
        const value = values[index];
        if (value === null || value === undefined) return null;
        if (value > 0n) out.set(batch[index], value);
      }
    }
  } catch {
    return null;
  }

  return out;
}
