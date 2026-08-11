import { encodeAbiParameters, encodePacked, keccak256, type Address, type Hex } from 'viem';
import { predictB20Address, saltFromCounter, type VanityHit } from './addressing';

/**
 * Adres vanity dla startu przez LAUNCHPAD - inaczej niz goly B20.
 *
 * ===========================================================================
 * DLACZEGO TO SIE ROZNI OD app/utils/b20/addressing.ts
 * ===========================================================================
 * Na `/b20/create` uzytkownik wola precompile B20 WPROST, wiec adres to po
 * prostu predictB20Address(jego_portfel, jego_salt). Tu token tworzy launchpad
 * przez `B20TokenFactory`, wiec adres liczy sie PRZEZ LANCUSZEK, dokladnie jak
 * `CurveLaunchpad.predictVanityToken`:
 *
 *     launchId      = keccak256(abi.encode(launchpad, creator, vanitySalt, chainId))
 *     effectiveSalt = keccak256(abi.encodePacked(launchpad, launchId))
 *     adres         = predictB20Address(B20TokenFactory, effectiveSalt)
 *
 * Kroki 1-2 sa 1:1 z Solidity (`_vanityLaunchId` + `B20TokenFactory._effectiveSalt`).
 * Krok 3 (getB20Address) jest tym samym precompile'm, ktory addressing.ts juz
 * wyprowadzil i sprawdzil z lancuchem - i ktory potwierdzil `b20AddressProbe.ts`
 * (preimage = abi.encode(sender, salt)). Uzytkownik mineruje po `vanitySalt`;
 * wynik zgadza sie z `predictVanityToken` co do bitu.
 *
 * WAZNE: creator wchodzi w preimage launchId, wiec adres jest ZWIAZANY z
 * konkretnym portfelem tworcy. Zmiana portfela => inny adres => trzeba kopac od
 * nowa. To jest zarazem to, co zamyka front-run (patrz docstring launchVanity).
 */

export type LaunchpadVanityContext = {
  launchpad: Address;
  factory: Address;
  creator: Address;
  chainId: number;
};

/** launchId = keccak256(abi.encode(launchpad, creator, vanitySalt, chainId)). */
export function launchpadVanityLaunchId(ctx: LaunchpadVanityContext, vanitySalt: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }],
      [ctx.launchpad, ctx.creator, vanitySalt, BigInt(ctx.chainId)],
    ),
  );
}

/** Adres, jaki dostanie ten tworca dla tego `vanitySalt`. Czysta funkcja, zero sieci. */
export function predictLaunchpadVanity(ctx: LaunchpadVanityContext, vanitySalt: Hex): Address {
  const launchId = launchpadVanityLaunchId(ctx, vanitySalt);
  const effectiveSalt = keccak256(encodePacked(['address', 'bytes32'], [ctx.launchpad, launchId]));
  return predictB20Address(ctx.factory, effectiveSalt, 'asset');
}

/** Poczatek 9-bajtowego ogona: '0x' + 'b2' + 9x'00' + bajt wariantu ASSET = 24 znaki. */
const HEAD_LEN = 24;

/**
 * Jedna partia kopania po `vanitySalt`. Ta sama dyscyplina co mineBatch w
 * addressing.ts (partiami, zeby nie zamrozic karty), ale liczy adres lancuszkiem
 * launchpada, wiec `hit.salt` to `vanitySalt` gotowy do podania `launchVanity`.
 */
export function mineLaunchpadVanity(
  ctx: LaunchpadVanityContext,
  pattern: string,
  from: bigint,
  batchSize: number,
): { hit: VanityHit | null; nextCounter: bigint } {
  const target = pattern.toLowerCase();
  let counter = from;
  for (let i = 0; i < batchSize; i += 1) {
    const salt = saltFromCounter(counter);
    const address = predictLaunchpadVanity(ctx, salt);
    if (address.slice(HEAD_LEN).toLowerCase().startsWith(target)) {
      return { hit: { salt, address, attempts: Number(counter - from) + 1 }, nextCounter: counter + 1n };
    }
    counter += 1n;
  }
  return { hit: null, nextCounter: counter };
}
