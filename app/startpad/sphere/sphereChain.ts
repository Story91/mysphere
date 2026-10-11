import { base } from 'viem/chains';
import { LAUNCHPAD_NETWORKS, deploymentsOf } from '../config';

/**
 * SPHERE JEST TYLKO NA BASE - i ten plik jest calym wyrazem tej decyzji.
 *
 * ===========================================================================
 * DLACZEGO HUB $SPHERE NIE MOZE CZYTAC KONFIGURACJI AKTYWNEJ SIECI
 * ===========================================================================
 * Startpad stoi na kilku lancuchach i wybor sieci (?c= / localStorage) steruje
 * ALL eksportami ACTIVE_* w config.ts: LAUNCHPAD_CHAIN, LAUNCHPAD_ADDRESS,
 * NATIVE_SYMBOL i tak dalej. Strony /startpad/sphere/* importowaly te wlasnie
 * stale, wiec wejscie w $SPHERE przy wybranym Arc dawalo trzy klamstwa naraz:
 *   1. odczyty on-chain szly klientem Arc - adresy peryferii SPHERE sa
 *      wdrozone na Base, wiec panele czytaly PUSTE kontrakty, a kafel
 *      "fees waiting" pytal launchpad ARC o oplaty dla SPHERE;
 *   2. kazda kwota byla podpisana "USDC", bo na Arc waluta natywna to USDC -
 *      a sezon SPHERE liczy WYLACZNIE zrealizowane ETH z Base (trasa
 *      /api/sphere/season ma CHAIN_ID = 8453 zapiete na sztywno, wiec dane
 *      byly z Base, tylko etykieta klamala);
 *   3. motyw sieci przemalowywal caly hub na barwy cudzego lancucha.
 * Kontrakt SPHERE bedzie zyl tylko na Base (docs/SPHERE-TOKENOMIKA.md), wiec
 * hub ma byc przybity do Base niezaleznie od tego, jaka siec ogladasz na
 * tablicy. Punkt 3 zalatwia wyjatek w networkTheme.ts; punkty 1-2 zalatwiaja
 * te stale.
 *
 * Wartosci NIE sa przepisane recznie - wychodza z wpisu Base w
 * LAUNCHPAD_NETWORKS, wiec nadpisania przez env (NEXT_PUBLIC_LAUNCHPAD_BASE_
 * ADDRESS itd.) dzialaja tu tak samo jak na tablicy.
 *
 * `usePublicClient({ chainId: SPHERE_CHAIN.id })` dziala przy KAZDEJ wybranej
 * sieci, bo `base` jest zawsze w konfiguracji wagmi (providers.tsx,
 * CHAINS_BASE) - wybor sieci startpada nie zmienia listy chainow wagmi.
 */
const BASE_ENTRY = LAUNCHPAD_NETWORKS[base.id];
/**
 * $SPHERE wystartowal na PIERWSZYM wdrozeniu (v1, 2026-08-11) i tam zostaje na
 * zawsze - jego krzywa, pula, hook i salda escrow/rewards zyja w kontraktach v1.
 * Glowne wdrozenie Base to od 2026-10-11 v2 (nowe starty), wiec hub SPHERE
 * NIE MOZE brac `BASE_ENTRY.launchpad` - wskazywalby kontrakt, ktory o SPHERE
 * nic nie wie.
 */
const SPHERE_DEPLOYMENT = deploymentsOf(BASE_ENTRY).find((d) => d.version === 1) ?? deploymentsOf(BASE_ENTRY)[0];

/** Lancuch SPHERE. Uzywac w kazdym odczycie i zapisie huba zamiast LAUNCHPAD_CHAIN. */
export const SPHERE_CHAIN = BASE_ENTRY.chain;
/** Launchpad na Base - zrodlo oplat, ktore zbiera escrow SPHERE. */
export const SPHERE_LAUNCHPAD_ADDRESS = SPHERE_DEPLOYMENT.launchpad;
/** Hook v4 na Base (fee po graduacji). */
export const SPHERE_HOOK_ADDRESS = SPHERE_DEPLOYMENT.hook;
/** Vault plynnosci na Base. */
export const SPHERE_VAULT_ADDRESS = SPHERE_DEPLOYMENT.vault;
/** Basescan - linki huba nie moga prowadzic do eksploratora innej sieci. */
export const SPHERE_EXPLORER_URL = BASE_ENTRY.explorerUrl;
/**
 * Zawsze "ETH". Celowo z definicji lancucha, nie z NATIVE_SYMBOL - tamto
 * podaza za wybrana siecia i na Arc mowi "USDC".
 */
export const SPHERE_NATIVE_SYMBOL = BASE_ENTRY.chain.nativeCurrency.symbol;
