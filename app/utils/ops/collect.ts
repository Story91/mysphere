/**
 * KONSOLA OPERATORA - ZBIERANIE STANU. WYLACZNIE SERWER.
 *
 * === ZASADA NUMER JEDEN TEGO PLIKU ===
 * AWARIA ODCZYTU TO NIE JEST ZERO. Kazda liczba ma typ `T | null`, a obok niej
 * stoi `error: string | null`. Gdy RPC nie odpowie, do UI idzie `null` i zdanie
 * "nie udalo sie sprawdzic" - nigdy 0, nigdy "brak srodkow", nigdy pusty
 * wiersz. Panel monitoringu, ktory po padnietym RPC pokazuje saldo 0, jest
 * gorszy niz brak panelu: uruchamia alarm, ktorego nie ma, albo - odwrotnie -
 * uspokaja, gdy nie wie.
 *
 * === ZERO TRANSAKCJI ===
 * Kazde wywolanie tutaj to eth_chainId / eth_blockNumber / eth_gasPrice /
 * eth_getBalance / eth_getCode / eth_call. Nic tu nie podpisuje i nie ma
 * dostepu do zadnego klucza prywatnego.
 *
 * === CO WYCHODZI DO PRZEGLADARKI ===
 * Adresy RPC NIE wychodza. Do klienta idzie sama NAZWA HOSTA uzytego endpointu
 * (`rpcHost`), bo pelny URL czesto niesie klucz API. Kwoty ida jako lancuchy
 * dziesietne w najmniejszej jednostce plus gotowy tekst - nigdzie po drodze nie
 * ma liczby zmiennoprzecinkowej, bo saldo escrow to nie jest miejsce na blad
 * zaokraglenia.
 */

import { createPublicClient, formatEther, formatUnits, http, type Address, type PublicClient } from 'viem';

import {
  ASK_ESCROW_ABI,
  ESCROW_TOKEN_DECIMALS,
  escrowDeployment,
} from '../asks/escrow';
import {
  ESCROW_WATCHED_CHAIN_IDS,
  OPS_CHAINS,
  WATCHED_CONTRACTS,
  WATCHED_WALLETS,
  X402_FACILITATOR_URL,
  X402_REQUIRED_KIND,
  explorerAddressUrl,
} from './registry';

/* ------------------------------------------------------------------ */
/*  TYPY WYNIKU                                                        */
/* ------------------------------------------------------------------ */

/**
 * 'unknown' NIE jest odmiana 'ok'. To osobny stan o wlasnym kolorze i wlasnym
 * zdaniu, zeby nie dalo sie pomylic "sprawdzone i dobrze" ze "sprawdzic sie
 * nie udalo".
 */
export type Health = 'ok' | 'info' | 'warn' | 'alarm' | 'unknown';

const HEALTH_RANK: Record<Health, number> = { ok: 0, info: 1, unknown: 2, warn: 3, alarm: 4 };

export function worstOf(values: Health[]): Health {
  return values.reduce<Health>((worst, v) => (HEALTH_RANK[v] > HEALTH_RANK[worst] ? v : worst), 'ok');
}

export interface GasRow {
  key: string;
  label: string;
  address: string;
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  explorerUrl: string | null;
  consequence: string;
  /** Saldo w wei jako lancuch dziesietny. null = nie udalo sie odczytac. */
  balanceWei: string | null;
  balanceText: string | null;
  /** Policzony koszt jednej typowej akcji tego adresu przy AKTUALNEJ cenie gazu. */
  costPerActionText: string | null;
  gasPriceText: string | null;
  /** Ile jeszcze takich akcji starczy. null = nie dalo sie policzyc. */
  actionsLeft: number | null;
  actionNoun: string;
  alarmBelowActions: number;
  warnBelowActions: number;
  /** false = ten adres niczego nie wysyla, wiec nie ma progu i nie ma oceny. */
  monitored: boolean;
  health: Health;
  error: string | null;
}

export interface EscrowRow {
  chainId: number;
  chainName: string;
  address: string;
  explorerUrl: string | null;
  tokenAddress: string;
  /** Suma zobowiazan z ksiegi kontraktu. */
  liabilitiesUnits: string | null;
  liabilitiesText: string | null;
  /** RZECZYWISTE saldo tokena kontraktu. */
  balanceUnits: string | null;
  balanceText: string | null;
  /** balance - liabilities. Ujemna = kontrakt jest niewyplacalny. */
  differenceUnits: string | null;
  differenceText: string | null;
  /** Zdanie po angielsku nazywajace to, co widac. */
  verdict: string;
  health: Health;
  error: string | null;
}

export interface FeeRow {
  chainId: number;
  chainName: string;
  escrowAddress: string;
  /** Odbiorca prowizji ODCZYTANY Z LANCUCHA, nie z pliku wdrozenia. */
  feeRecipient: string | null;
  /** true = lancuch i deployments/askEscrow.<id>.json mowia to samo. */
  matchesDeploymentFile: boolean | null;
  claimableUnits: string | null;
  claimableText: string | null;
  health: Health;
  error: string | null;
}

export interface FacilitatorStatus {
  url: string;
  requiredKind: string;
  /** true / false / null gdy zapytanie w ogole nie doszlo. */
  supported: boolean | null;
  kindsSeen: number | null;
  health: Health;
  error: string | null;
}

export interface ContractRow {
  key: string;
  label: string;
  address: string;
  chainId: number;
  chainName: string;
  source: string;
  expects: 'code' | 'no-code' | 'probe' | 'delegated';
  note?: string;
  /** Rozmiar bajtkodu w bajtach. null = nie udalo sie sprawdzic. */
  codeSize: number | null;
  /** EIP-7702: pod adresem stoi delegacja portfela, a nie kontrakt. */
  is7702: boolean;
  explorerUrl: string | null;
  health: Health;
  error: string | null;
}

export interface ChainStatus {
  chainId: number;
  chainName: string;
  /** Sama nazwa hosta - pelny URL moze niesc klucz API i nie wychodzi z serwera. */
  rpcHost: string | null;
  blockNumber: string | null;
  health: Health;
  error: string | null;
}

export interface OpsHot {
  checkedAt: number;
  gas: GasRow[];
  escrow: EscrowRow[];
  fees: FeeRow[];
  facilitator: FacilitatorStatus;
  chains: ChainStatus[];
}

export interface OpsCold {
  checkedAt: number;
  contracts: ContractRow[];
  chains: ChainStatus[];
}

export interface OpsReport {
  hot: OpsHot;
  cold: OpsCold;
  /** Najgorszy stan w calej konsoli - do jednego zdania na gorze strony. */
  worst: Health;
}

/* ------------------------------------------------------------------ */
/*  POLACZENIA                                                         */
/* ------------------------------------------------------------------ */

interface Connection {
  client: PublicClient | null;
  host: string | null;
  blockNumber: bigint | null;
  error: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown host';
  }
}

function short(error: unknown): string {
  const message =
    (error as { shortMessage?: string })?.shortMessage ||
    (error as { message?: string })?.message ||
    String(error);
  return message.split('\n')[0].slice(0, 180);
}

/**
 * Probuje kolejne RPC lancucha, az ktorys odpowie I POTWIERDZI chainId.
 * Sprawdzenie chainId nie jest paranoja: endpoint, ktory po cichu przekierowal
 * na inna siec, oddalby saldo 0 dla adresu, ktory na wlasciwej sieci ma
 * pieniadze - czyli falszywy alarm nie do odroznienia od prawdziwego.
 */
async function connect(chainId: number): Promise<Connection> {
  const meta = OPS_CHAINS[chainId];
  if (!meta) return { client: null, host: null, blockNumber: null, error: `Chain ${chainId} is not in the ops registry` };

  const failures: string[] = [];
  for (const url of meta.rpcs) {
    try {
      const client = createPublicClient({
        // retryCount 0: konsola ma odpowiedziec szybko i szczerze. Ponawianie
        // zalatwia lista RPC, a nie czekanie na tym samym martwym endpointcie.
        transport: http(url, { timeout: 8_000, retryCount: 0 }),
      });
      const reported = await client.getChainId();
      if (reported !== chainId) {
        failures.push(`${hostOf(url)}: reports chain ${reported}, expected ${chainId}`);
        continue;
      }
      const blockNumber = await client.getBlockNumber();
      return { client: client as PublicClient, host: hostOf(url), blockNumber, error: null };
    } catch (error) {
      failures.push(`${hostOf(url)}: ${short(error)}`);
    }
  }
  return {
    client: null,
    host: null,
    blockNumber: null,
    error: failures.length ? failures.join(' | ') : 'no RPC endpoint configured for this chain',
  };
}

/** Jedno polaczenie na lancuch na przebieg - nie po jednym na odczyt. */
function connectionPool() {
  const pending = new Map<number, Promise<Connection>>();
  return (chainId: number) => {
    let promise = pending.get(chainId);
    if (!promise) {
      promise = connect(chainId);
      pending.set(chainId, promise);
    }
    return promise;
  };
}

function chainStatusesFrom(entries: Array<[number, Connection]>): ChainStatus[] {
  return entries.map(([chainId, conn]) => ({
    chainId,
    chainName: OPS_CHAINS[chainId]?.name ?? `chain ${chainId}`,
    rpcHost: conn.host,
    blockNumber: conn.blockNumber !== null ? conn.blockNumber.toString() : null,
    health: conn.client ? 'ok' : 'unknown',
    error: conn.error,
  }));
}

/* ------------------------------------------------------------------ */
/*  FORMATOWANIE                                                       */
/* ------------------------------------------------------------------ */

/**
 * Saldo natywne w czytelnej formie. Obcinamy do 8 miejsc, ale saldo NIEZEROWE
 * nigdy nie moze wyswietlic sie jako "0" - w monitoringu gazu roznica miedzy
 * "pusto" a "prawie pusto" to cala tresc komunikatu.
 */
function formatNative(wei: bigint): string {
  const full = formatEther(wei);
  const [whole, fraction = ''] = full.split('.');
  if (!fraction) return whole;
  const trimmed = fraction.slice(0, 8).replace(/0+$/, '');
  if (trimmed) return `${whole}.${trimmed}`;
  return wei > 0n ? '<0.00000001' : whole;
}

/** Kwota tokena 6-miejscowego. Bez float - formatUnits pracuje na bigint. */
function formatToken(units: bigint): string {
  const negative = units < 0n;
  const text = formatUnits(negative ? -units : units, ESCROW_TOKEN_DECIMALS);
  return negative ? `-${text}` : text;
}

/* ------------------------------------------------------------------ */
/*  1. GAZ                                                             */
/* ------------------------------------------------------------------ */

async function collectGas(getConnection: (chainId: number) => Promise<Connection>): Promise<GasRow[]> {
  // Cena gazu per lancuch - jeden odczyt, nie jeden na portfel.
  const gasPriceCache = new Map<number, { value: bigint | null; error: string | null }>();

  async function gasPriceFor(chainId: number, client: PublicClient) {
    const cached = gasPriceCache.get(chainId);
    if (cached) return cached;
    let result: { value: bigint | null; error: string | null };
    try {
      result = { value: await client.getGasPrice(), error: null };
    } catch (error) {
      result = { value: null, error: short(error) };
    }
    gasPriceCache.set(chainId, result);
    return result;
  }

  const rows = await Promise.all(
    WATCHED_WALLETS.map(async (wallet): Promise<GasRow> => {
      const chain = OPS_CHAINS[wallet.chainId];
      const base = {
        key: wallet.key,
        label: wallet.label,
        address: wallet.address,
        chainId: wallet.chainId,
        chainName: chain?.name ?? `chain ${wallet.chainId}`,
        nativeSymbol: chain?.nativeSymbol ?? 'ETH',
        explorerUrl: explorerAddressUrl(wallet.chainId, wallet.address),
        consequence: wallet.consequence,
        actionNoun: wallet.actionNoun,
        alarmBelowActions: wallet.alarmBelowActions,
        warnBelowActions: wallet.warnBelowActions,
        monitored: wallet.gasPerAction !== null,
      };

      const conn = await getConnection(wallet.chainId);
      if (!conn.client) {
        return {
          ...base,
          balanceWei: null,
          balanceText: null,
          costPerActionText: null,
          gasPriceText: null,
          actionsLeft: null,
          health: 'unknown',
          error: conn.error,
        };
      }

      let balance: bigint;
      try {
        balance = await conn.client.getBalance({ address: wallet.address });
      } catch (error) {
        return {
          ...base,
          balanceWei: null,
          balanceText: null,
          costPerActionText: null,
          gasPriceText: null,
          actionsLeft: null,
          health: 'unknown',
          error: `balance read failed: ${short(error)}`,
        };
      }

      const balanceWei = balance.toString();
      const balanceText = `${formatNative(balance)} ${base.nativeSymbol}`;

      // Adres, ktory tylko przyjmuje - saldo pokazujemy, oceny nie wydajemy.
      if (wallet.gasPerAction === null) {
        return {
          ...base,
          balanceWei,
          balanceText,
          costPerActionText: null,
          gasPriceText: null,
          actionsLeft: null,
          health: 'info',
          error: null,
        };
      }

      const gasPrice = await gasPriceFor(wallet.chainId, conn.client);
      if (gasPrice.value === null || gasPrice.value === 0n) {
        // Saldo znamy, zapasu NIE znamy. Nie zgadujemy progu - mowimy wprost,
        // ze ocena jest niedostepna, i pokazujemy sama liczbe.
        return {
          ...base,
          balanceWei,
          balanceText,
          costPerActionText: null,
          gasPriceText: null,
          actionsLeft: null,
          health: 'unknown',
          error: gasPrice.error
            ? `gas price read failed, runway cannot be estimated: ${gasPrice.error}`
            : 'the chain reports a gas price of zero, so runway cannot be estimated',
        };
      }

      const costPerAction = gasPrice.value * wallet.gasPerAction;
      const actionsLeft = Number(balance / costPerAction);

      const health: Health =
        actionsLeft < wallet.alarmBelowActions ? 'alarm' : actionsLeft < wallet.warnBelowActions ? 'warn' : 'ok';

      return {
        ...base,
        balanceWei,
        balanceText,
        costPerActionText: `${formatNative(costPerAction)} ${base.nativeSymbol}`,
        gasPriceText: `${formatUnits(gasPrice.value, 9)} gwei`,
        actionsLeft,
        health,
        error: null,
      };
    })
  );

  return rows;
}

/* ------------------------------------------------------------------ */
/*  2. ESCROW + 3. PROWIZJA                                            */
/* ------------------------------------------------------------------ */

/**
 * Widoki escrow, ktorych NIE MA w ASK_ESCROW_ABI, bo aplikacja ich nie wola.
 * Konsola wola - i to jest jedyny powod, dla ktorego istnieje ten fragment.
 * `claimable` swiadomie NIE jest tu powtorzone: bierzemy je z ASK_ESCROW_ABI.
 */
const ESCROW_VIEW_ABI = [
  { type: 'function', name: 'totalLiabilities', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'TOKEN', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'FEE_RECIPIENT', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const;

const ERC20_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

async function collectEscrow(
  getConnection: (chainId: number) => Promise<Connection>
): Promise<{ escrow: EscrowRow[]; fees: FeeRow[] }> {
  const escrow: EscrowRow[] = [];
  const fees: FeeRow[] = [];

  for (const chainId of ESCROW_WATCHED_CHAIN_IDS) {
    const deployment = escrowDeployment(chainId);
    const chainName = OPS_CHAINS[chainId]?.name ?? `chain ${chainId}`;
    if (!deployment) continue;

    const escrowBase = {
      chainId,
      chainName,
      address: deployment.address,
      explorerUrl: explorerAddressUrl(chainId, deployment.address),
      tokenAddress: deployment.token,
    };
    const feeBase = { chainId, chainName, escrowAddress: deployment.address };

    const conn = await getConnection(chainId);
    if (!conn.client) {
      escrow.push({
        ...escrowBase,
        liabilitiesUnits: null, liabilitiesText: null,
        balanceUnits: null, balanceText: null,
        differenceUnits: null, differenceText: null,
        verdict: 'Solvency could not be checked - the chain did not answer.',
        health: 'unknown',
        error: conn.error,
      });
      fees.push({
        ...feeBase,
        feeRecipient: null, matchesDeploymentFile: null,
        claimableUnits: null, claimableText: null,
        health: 'unknown',
        error: conn.error,
      });
      continue;
    }

    const client = conn.client;

    // Ksiega i saldo czytane OSOBNO i oceniane razem. Odczyt tokena idzie do
    // adresu tokena z pliku wdrozenia, ale TOKEN() z kontraktu tez czytamy -
    // rozjazd tych dwoch znaczylby, ze porownujemy saldo nie tego aktywa.
    const [liabilities, onchainToken, feeRecipient] = await Promise.all([
      client.readContract({ address: deployment.address, abi: ESCROW_VIEW_ABI, functionName: 'totalLiabilities' }).then(
        (v) => ({ value: v as bigint, error: null as string | null }),
        (e) => ({ value: null, error: short(e) })
      ),
      client.readContract({ address: deployment.address, abi: ESCROW_VIEW_ABI, functionName: 'TOKEN' }).then(
        (v) => ({ value: v as Address, error: null as string | null }),
        (e) => ({ value: null, error: short(e) })
      ),
      client.readContract({ address: deployment.address, abi: ESCROW_VIEW_ABI, functionName: 'FEE_RECIPIENT' }).then(
        (v) => ({ value: v as Address, error: null as string | null }),
        (e) => ({ value: null, error: short(e) })
      ),
    ]);

    const tokenAddress = onchainToken.value ?? deployment.token;

    const tokenBalance = await client
      .readContract({ address: tokenAddress, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [deployment.address] })
      .then(
        (v) => ({ value: v as bigint, error: null as string | null }),
        (e) => ({ value: null, error: short(e) })
      );

    /* --- wyplacalnosc --- */
    if (liabilities.value === null || tokenBalance.value === null) {
      // JEDNA z dwoch liczb nie wystarczy. Porownanie ma sens tylko w parze,
      // wiec pokazujemy to, co mamy, i mowimy wprost, ze werdyktu nie ma.
      escrow.push({
        ...escrowBase,
        liabilitiesUnits: liabilities.value !== null ? liabilities.value.toString() : null,
        liabilitiesText: liabilities.value !== null ? `${formatToken(liabilities.value)} USDC` : null,
        balanceUnits: tokenBalance.value !== null ? tokenBalance.value.toString() : null,
        balanceText: tokenBalance.value !== null ? `${formatToken(tokenBalance.value)} USDC` : null,
        differenceUnits: null,
        differenceText: null,
        verdict: 'Solvency needs both numbers and one of them is missing, so there is no verdict here.',
        health: 'unknown',
        error: liabilities.error ?? tokenBalance.error,
      });
    } else {
      const difference = tokenBalance.value - liabilities.value;
      let verdict: string;
      let health: Health;
      if (difference === 0n) {
        verdict = 'The ledger and the real balance agree to the cent.';
        health = 'ok';
      } else if (difference < 0n) {
        verdict =
          `Short by ${formatToken(-difference)} USDC. The contract owes more than it holds, so someone who claims will be turned away. ` +
          'This breaks the contract invariant balanceOf >= totalLiabilities.';
        health = 'alarm';
      } else {
        verdict =
          `Surplus of ${formatToken(difference)} USDC sits in the contract that the ledger does not owe to anyone. ` +
          'Tokens were sent straight to the address. The contract has no rescue function, so this amount cannot be moved by anyone, ever.';
        health = 'alarm';
      }

      escrow.push({
        ...escrowBase,
        liabilitiesUnits: liabilities.value.toString(),
        liabilitiesText: `${formatToken(liabilities.value)} USDC`,
        balanceUnits: tokenBalance.value.toString(),
        balanceText: `${formatToken(tokenBalance.value)} USDC`,
        differenceUnits: difference.toString(),
        differenceText: `${difference > 0n ? '+' : ''}${formatToken(difference)} USDC`,
        verdict,
        health,
        error: null,
      });
    }

    /* --- prowizja do odebrania --- */
    if (!feeRecipient.value) {
      fees.push({
        ...feeBase,
        feeRecipient: null,
        matchesDeploymentFile: null,
        claimableUnits: null,
        claimableText: null,
        health: 'unknown',
        error: feeRecipient.error ?? 'FEE_RECIPIENT could not be read',
      });
    } else {
      const claimable = await client
        .readContract({ address: deployment.address, abi: ASK_ESCROW_ABI, functionName: 'claimable', args: [feeRecipient.value] })
        .then(
          (v) => ({ value: v as bigint, error: null as string | null }),
          (e) => ({ value: null, error: short(e) })
        );

      // Plik wdrozenia jest DEKLARACJA, lancuch jest prawda. Pokazujemy, gdy
      // sie rozjezdzaja - to znaczyloby, ze plik opisuje inne wdrozenie.
      const matchesDeploymentFile =
        deployment.feeRecipient.toLowerCase() === feeRecipient.value.toLowerCase();

      fees.push({
        ...feeBase,
        feeRecipient: feeRecipient.value,
        matchesDeploymentFile,
        claimableUnits: claimable.value !== null ? claimable.value.toString() : null,
        claimableText: claimable.value !== null ? `${formatToken(claimable.value)} USDC` : null,
        health: claimable.value === null ? 'unknown' : 'info',
        error: claimable.error,
      });
    }
  }

  return { escrow, fees };
}

/* ------------------------------------------------------------------ */
/*  4. FACILITATOR X402                                                */
/* ------------------------------------------------------------------ */

/**
 * Jedyne pytanie: czy facilitator NADAL deklaruje dokladnie ten schemat,
 * ktorym placa nasi agenci. Gdy zniknie, platnosci przestana dzialac bez
 * jednej zmiany po naszej stronie - czyli awaria, ktorej nie da sie znalezc
 * w naszym repo.
 */
async function collectFacilitator(): Promise<FacilitatorStatus> {
  const requiredKind = `x402Version ${X402_REQUIRED_KIND.x402Version}, scheme "${X402_REQUIRED_KIND.scheme}", network "${X402_REQUIRED_KIND.network}"`;
  const url = `${X402_FACILITATOR_URL.replace(/\/+$/, '')}/supported`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return { url, requiredKind, supported: null, kindsSeen: null, health: 'unknown', error: `HTTP ${response.status} from the facilitator` };
    }
    const payload: unknown = await response.json();

    // Ksztalt odpowiedzi bierzemy tolerancyjnie: `{kinds:[...]}` albo goła
    // tablica. Twarde zalozenie o ksztalcie zamienialoby zmiane formatu
    // w falszywe "facilitator nas nie obsluguje".
    const kinds: unknown[] = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { kinds?: unknown }).kinds)
        ? ((payload as { kinds: unknown[] }).kinds)
        : [];

    if (kinds.length === 0) {
      return { url, requiredKind, supported: null, kindsSeen: null, health: 'unknown', error: 'the response carried no recognisable list of supported kinds' };
    }

    const supported = kinds.some((entry) => {
      if (typeof entry !== 'object' || entry === null) return false;
      const kind = entry as { x402Version?: unknown; scheme?: unknown; network?: unknown };
      return (
        Number(kind.x402Version) === X402_REQUIRED_KIND.x402Version &&
        String(kind.scheme) === X402_REQUIRED_KIND.scheme &&
        String(kind.network) === X402_REQUIRED_KIND.network
      );
    });

    return {
      url,
      requiredKind,
      supported,
      kindsSeen: kinds.length,
      health: supported ? 'ok' : 'alarm',
      error: supported ? null : 'the facilitator no longer lists the exact scheme our agents pay with',
    };
  } catch (error) {
    return { url, requiredKind, supported: null, kindsSeen: null, health: 'unknown', error: short(error) };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  5. KONTRAKTY                                                       */
/* ------------------------------------------------------------------ */

async function collectContracts(
  getConnection: (chainId: number) => Promise<Connection>
): Promise<ContractRow[]> {
  return Promise.all(
    WATCHED_CONTRACTS.map(async (target): Promise<ContractRow> => {
      const chainName = OPS_CHAINS[target.chainId]?.name ?? `chain ${target.chainId}`;
      const base = {
        key: target.key,
        label: target.label,
        address: target.address,
        chainId: target.chainId,
        chainName,
        source: target.source,
        expects: target.expects,
        note: target.note,
        explorerUrl: explorerAddressUrl(target.chainId, target.address),
      };

      const conn = await getConnection(target.chainId);
      if (!conn.client) {
        return { ...base, codeSize: null, is7702: false, health: 'unknown', error: conn.error };
      }

      let code: `0x${string}` | undefined;
      try {
        code = await conn.client.getCode({ address: target.address });
      } catch (error) {
        return { ...base, codeSize: null, is7702: false, health: 'unknown', error: short(error) };
      }

      const hex = code ?? '0x';
      const codeSize = hex === '0x' ? 0 : (hex.length - 2) / 2;
      // EIP-7702: 23 bajty zaczynajace sie od 0xef0100 to portfel z delegacja,
      // a nie kontrakt. Mylenie tych dwoch rzeczy w konsoli operatora
      // znaczyloby "kontrakt stoi", gdy naprawde ktos delegowal portfel.
      const is7702 = hex.startsWith('0xef0100');

      let health: Health;
      let error: string | null = null;
      if (target.expects === 'probe') {
        health = 'info';
      } else if (target.expects === 'code') {
        health = codeSize > 0 ? 'ok' : 'alarm';
        if (codeSize === 0) error = 'no bytecode at this address on the network the app calls it on';
        if (is7702) {
          health = 'alarm';
          error = 'this is a delegated wallet (EIP-7702), not the contract the app expects';
        }
      } else if (target.expects === 'delegated') {
        // Delegacja jest STANEM ZAPISANYM. Warta uwagi jest jej zmiana, nie
        // jej obecnosc - inaczej ten wiersz swiecilby zawsze i nauczylby
        // patrzacego omijac go wzrokiem.
        health = is7702 ? 'ok' : 'warn';
        if (!is7702) {
          error =
            codeSize === 0
              ? 'the recorded EIP-7702 delegation is gone from this wallet'
              : 'this address now carries plain bytecode instead of the recorded EIP-7702 delegation';
        }
      } else {
        // 'no-code': cisza, gdy pusto. Kod, ktory sie POJAWIL, jest wart uwagi.
        health = codeSize === 0 ? 'ok' : 'warn';
        if (codeSize > 0) {
          error = is7702
            ? 'an EIP-7702 delegation is now installed on this wallet. Normal for a smart wallet, a takeover signal for a plain key - worth knowing which this is.'
            : 'bytecode appeared at an address that is supposed to have none';
        }
      }

      return { ...base, codeSize, is7702, health, error };
    })
  );
}

/* ------------------------------------------------------------------ */
/*  PRZEBIEGI + PAMIEC PODRECZNA                                       */
/* ------------------------------------------------------------------ */

/**
 * === DLACZEGO DWA OKNA, A NIE JEDNO ===
 * Te dane starzeja sie z rozna predkoscia i mieszanie ich w jeden interwal
 * znaczyloby albo odpytywanie 8 lancuchow co minute bez powodu, albo
 * ogladanie salda gazu sprzed kwadransa.
 *
 * GORACE (60 s): gaz, wyplacalnosc escrow, prowizja, facilitator. Okolo 20
 * wywolan na przebieg. To sa liczby, ktore moga sie zmienic miedzy jedna
 * a druga platnoscia agenta, wiec minuta jest gorna granica sensu.
 *
 * ZIMNE (15 min): bajtkod pod ~25 adresami na 8 lancuchach. Kontrakt nie gubi
 * kodu sam z siebie - to jest kontrola inwentarza, nie monitoring. Czestsze
 * odpytywanie bylo by placeniem limitami RPC za odpowiedz, ktora sie nie
 * zmienia.
 *
 * Pamiec jest w module, czyli per instancja serwera. To wystarcza: jedyny
 * odbiorca tej trasy to jeden admin, a zimny start kosztuje jeden pelny
 * przebieg.
 */
const HOT_TTL_MS = 60_000;
const COLD_TTL_MS = 15 * 60_000;

/**
 * Recznemu odswiezeniu tez stawiamy dolna granice. Bez niej przytrzymany
 * przycisk zamienia konsole w narzedzie do wyczerpania wlasnych limitow RPC -
 * czyli w awarie, ktorej mial pilnowac.
 */
const MIN_FORCE_INTERVAL_MS = 15_000;

interface CacheSlot<T> {
  data: T | null;
  at: number;
  inFlight: Promise<T> | null;
}

const hotCache: CacheSlot<OpsHot> = { data: null, at: 0, inFlight: null };
const coldCache: CacheSlot<OpsCold> = { data: null, at: 0, inFlight: null };

async function runHot(): Promise<OpsHot> {
  const getConnection = connectionPool();
  const usedChains = new Set<number>([...WATCHED_WALLETS.map((w) => w.chainId), ...ESCROW_WATCHED_CHAIN_IDS]);

  const [gas, escrowAndFees, facilitator] = await Promise.all([
    collectGas(getConnection),
    collectEscrow(getConnection),
    collectFacilitator(),
  ]);

  const chainEntries = await Promise.all(
    Array.from(usedChains).map(async (chainId): Promise<[number, Connection]> => [chainId, await getConnection(chainId)])
  );

  return {
    checkedAt: Date.now(),
    gas,
    escrow: escrowAndFees.escrow,
    fees: escrowAndFees.fees,
    facilitator,
    chains: chainStatusesFrom(chainEntries),
  };
}

async function runCold(): Promise<OpsCold> {
  const getConnection = connectionPool();
  const contracts = await collectContracts(getConnection);
  const usedChains = Array.from(new Set(WATCHED_CONTRACTS.map((c) => c.chainId)));
  const chainEntries = await Promise.all(
    usedChains.map(async (chainId): Promise<[number, Connection]> => [chainId, await getConnection(chainId)])
  );
  return { checkedAt: Date.now(), contracts, chains: chainStatusesFrom(chainEntries) };
}

/**
 * Wspolny mechanizm: swiezy wynik z pamieci, jeden przebieg naraz
 * (drugie zadanie doczepia sie do trwajacego zamiast startowac swoj).
 */
async function fromCache<T>(slot: CacheSlot<T>, ttlMs: number, run: () => Promise<T>, force: boolean): Promise<T> {
  const age = Date.now() - slot.at;
  const stale = age >= ttlMs || slot.data === null;
  const forceAllowed = force && age >= MIN_FORCE_INTERVAL_MS;

  if (!stale && !forceAllowed && slot.data !== null) return slot.data;
  if (slot.inFlight) return slot.inFlight;

  const promise = run()
    .then((data) => {
      slot.data = data;
      slot.at = Date.now();
      return data;
    })
    .finally(() => {
      slot.inFlight = null;
    });

  slot.inFlight = promise;
  return promise;
}

export type RefreshScope = 'none' | 'hot' | 'all';

/**
 * Jedyne wejscie do konsoli. `scope` mowi, co wolno wymusic - i nawet
 * wymuszenie respektuje MIN_FORCE_INTERVAL_MS.
 */
export async function collectOpsReport(scope: RefreshScope = 'none'): Promise<OpsReport> {
  const [hot, cold] = await Promise.all([
    fromCache(hotCache, HOT_TTL_MS, runHot, scope === 'hot' || scope === 'all'),
    fromCache(coldCache, COLD_TTL_MS, runCold, scope === 'all'),
  ]);

  const worst = worstOf([
    ...hot.gas.map((r) => r.health),
    ...hot.escrow.map((r) => r.health),
    ...hot.fees.map((r) => r.health),
    hot.facilitator.health,
    ...cold.contracts.map((r) => r.health),
  ]);

  return { hot, cold, worst };
}

/** Odstepy sa czescia kontraktu z UI - klient musi wiedziec, jak czesto pytac. */
export const OPS_TIMINGS = {
  hotTtlMs: HOT_TTL_MS,
  coldTtlMs: COLD_TTL_MS,
  minForceIntervalMs: MIN_FORCE_INTERVAL_MS,
} as const;
