'use client';

/**
 * CLAIM NAGROD SEZONU - przycisk, ktorego brakowalo.
 *
 * Nagrody w SPHERE ida przez SphereStreamingMerkleDistributor: proposer
 * publikuje root epoki (okno weta = MIN_DELAY, czytane z lancucha), keeper
 * aktywuje, a KAZDY moze odebrac czyjas narosla czesc. Liscie sa KUMULATYWNE
 * (account, cumulative, prevCumulative), wiec jeden claim placi wszystko, co
 * naroslo pod AKTYWNYM rootem. Przyrost biezacej epoki uwalnia sie liniowo
 * przez STREAM_DURATION od aktywacji.
 *
 * Proofy bierzemy z publicznego manifestu (public/sphere-epochs/epoch-N.json),
 * ktorego manifestHash mozna porownac z tym w kontrakcie. Zadna liczba, od
 * ktorej zalezy wyplata, nie jest liczona w przegladarce: kontrakt sam
 * sprawdza proof, monotonicznosc i ile juz odebrano.
 *
 * 2026-09-10, DWIE POPRAWKI UCZCIWOSCI I JEDNA POPRAWKA POPRAWNOSCI:
 *  1. MANIFEST WYBIERAMY PO ROOCIE Z LANCUCHA, nie po latest.json. latest.json
 *     wskazuje NAJNOWSZY opublikowany manifest, a to zwykle epoka dopiero
 *     ZAPROPONOWANA (czeka w oknie weta) - aktywny root jest wtedy o jedna
 *     epoke starszy. Dzis (root epochId=1 = epoch-2.json, pending epochId=2 =
 *     epoch-3.json) karta brala liscie z epoch-3 do aktywnego roota z epoch-2:
 *     podsumowanie klamalo (5 tworcow zamiast 1), a claim() konczylby sie
 *     InvalidProof, bo proof jest z INNEGO drzewa. root() jest w kontrakcie,
 *     a kazdy epoch-N.json niesie swoj `root` - dopasowanie jest jednoznaczne.
 *  2. "nigdy nie przepada" bylo mocniejsze niz kontrakt. Kontrakt gwarantuje
 *     wylacznie, ze totalCumulative nie maleje (ShrinkingTotal), a claim()
 *     weryfikuje proof przeciw AKTYWNEMU rootowi - przeniesienie salda konta
 *     dalej zalezy od tego, czy proposer wpisze je w kolejny root. Mowimy to
 *     wprost zamiast obiecywac wieczystosc.
 *  3. ZAPROPONOWANY ROOT WIDOCZNY TAKZE, GDY EPOKA JUZ PLYNIE. pending() bylo
 *     czytane, ale renderowane tylko w gałęzi "nic nie plynie" - tworca nie
 *     mial gdzie zobaczyc, ile i kiedy przyjdzie. Teraz jest pasek "Next
 *     epoch" z kwota, odliczaniem do validAt i wlasnym przydzialem.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEther, parseAbi, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Clock, Gift, Loader2 } from 'lucide-react';
import { SPHERE_CHAIN, SPHERE_EXPLORER_URL } from '../sphereChain';
import { SPHERE_DISTRIBUTOR_ADDRESS, SPHERE_TOKEN_ADDRESS } from '../sphereConfig';
import StreamLane from './StreamLane';

const distributorAbi = parseAbi([
  'function root() view returns (bytes32)',
  'function manifestHash() view returns (bytes32)',
  'function epochId() view returns (uint64)',
  'function activatedAt() view returns (uint64)',
  'function STREAM_DURATION() view returns (uint64)',
  'function MIN_DELAY() view returns (uint64)',
  'function totalCumulative() view returns (uint256)',
  'function totalClaimed() view returns (uint256)',
  'function claimed(address) view returns (uint256)',
  'function vestedOf(uint256 cumulative, uint256 prevCumulative) view returns (uint256)',
  'function pending() view returns (bytes32 root, bytes32 manifestHash, uint64 epochId, uint256 totalCumulative, uint64 validAt)',
  'function claim(address account, uint256 cumulative, uint256 prevCumulative, bytes32[] proof)',
]);

const ZERO32 = `0x${'0'.repeat(64)}`;
const erc20BalanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);
const erc20SymbolAbi = parseAbi(['function symbol() view returns (string)']);

type Latest = { epoch: number; onchainEpochId: string; root: string; manifestHash: string; totalCumulative: string };
type Leaf = { account: string; cumulative: string; prevCumulative: string; proof?: string[] };
/** Manifest epoki - tylko pola, ktorych karta uzywa (pelny ksztalt: publishEpoch.ts). */
type Manifest = {
  epoch?: number;
  /** Root drzewa TEJ epoki - po nim dopasowujemy manifest do stanu kontraktu. */
  root?: string;
  manifestHash?: string;
  leaves?: Leaf[];
  inputs?: { token: string; creator: string }[];
  result?: { creators?: { creator: string; shareBps: string }[] };
};
/**
 * ZA CO ta nagroda: tokeny tworcy z manifestu (symbole czytane z lancucha),
 * udzial w puli i numer epoki. Bez tego wiersz pokazywal goly adres, a
 * leaderboard nizej dotyczy INNEJ epoki (w toku) - wygladalo, jakby nagroda
 * szla do kogos spoza listy tworcow.
 */
type Earned = { symbols: string[]; shareBps: number; epoch: number; manifestUrl: string };

/** Rozwiazany manifest: numer epoki sezonu, liscie i opisy "za co". */
type Resolved = { epoch: number; leaves: Leaf[]; earned: Record<string, Earned>; manifestHash: string };

export type DistributorState = {
  live: boolean;
  /** Aktywny root - po NIM rozpoznajemy wlasciwy manifest (nie po latest.json). */
  root: string;
  epochId: number;
  activatedAt: number;
  streamSeconds: number;
  /** Okno weta z kontraktu (immutable) - zeby UI nie zgadywalo "24h". */
  minDelaySeconds: number;
  totalCumulative: bigint;
  totalClaimed: bigint;
  /** Saldo SPHERE dystrybutora - podstawa calej ksiegi puli. */
  balance: bigint;
  pendingRoot: string;
  pendingValidAt: number;
  pendingEpochId: number;
  pendingTotalCumulative: bigint;
  /** Wolna pula = saldo SPHERE dystrybutora minus to, co juz obiecane, a nieodebrane.
   *  Automat epoki bierze dokladnie te liczbe jako pule nastepnej epoki. */
  poolFree: bigint;
};

/** Stan dystrybutora - uzywany takze przez naglowek sezonu (plakietka shadow/live). */
export function useSphereDistributor(): DistributorState | null {
  const client = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [state, setState] = useState<DistributorState | null>(null);
  useEffect(() => {
    if (!client || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    let alive = true;
    const addr = SPHERE_DISTRIBUTOR_ADDRESS;
    /**
     * JEDEN multicall zamiast dziewieciu rownoleglych eth_call.
     *
     * Publiczny RPC Base (mainnet.base.org - domyslny, gdy nie ma env-owego
     * endpointu) odbija czesc burstu bledem 429, a `Promise.all` odrzuca
     * WSZYSTKO, gdy odpadnie jedno zapytanie: stan zostawal null w
     * nieskonczonosc, wiec kafel puli, ksiega i cala karta Claim po prostu
     * nie renderowaly sie na stronie sezonu. Zmierzone 2026-09-10 w
     * przegladarce: 4 z 9 rownoleglych calli wracalo z 429. Multicall3 na
     * Base sklada to w POJEDYNCZE eth_call - jedno zapytanie nie ma czego
     * przekroczyc, a spojnosc odczytow rosnie (wszystko z tego samego bloku).
     */
    const load = async () => {
      try {
        const reads = [
          { address: addr, abi: distributorAbi, functionName: 'root' },
          { address: addr, abi: distributorAbi, functionName: 'epochId' },
          { address: addr, abi: distributorAbi, functionName: 'activatedAt' },
          { address: addr, abi: distributorAbi, functionName: 'STREAM_DURATION' },
          { address: addr, abi: distributorAbi, functionName: 'MIN_DELAY' },
          { address: addr, abi: distributorAbi, functionName: 'totalCumulative' },
          { address: addr, abi: distributorAbi, functionName: 'totalClaimed' },
          { address: addr, abi: distributorAbi, functionName: 'pending' },
          ...(SPHERE_TOKEN_ADDRESS
            ? [{ address: SPHERE_TOKEN_ADDRESS, abi: erc20BalanceAbi, functionName: 'balanceOf', args: [addr] }]
            : []),
        ];
        const out = (await client.multicall({ contracts: reads, allowFailure: false })) as unknown as unknown[];
        const root = out[0] as string;
        const epochId = out[1] as bigint;
        const activatedAt = out[2] as bigint;
        const stream = out[3] as bigint;
        const minDelay = out[4] as bigint;
        const totalCumulative = out[5] as bigint;
        const totalClaimed = out[6] as bigint;
        const pending = out[7] as readonly [string, string, bigint, bigint, bigint];
        const balance = (out[8] as bigint | undefined) ?? 0n;
        if (!alive) return;
        setState({
          live: root !== ZERO32,
          root: root as string,
          epochId: Number(epochId),
          activatedAt: Number(activatedAt),
          streamSeconds: Number(stream),
          minDelaySeconds: Number(minDelay),
          totalCumulative,
          totalClaimed,
          balance,
          pendingRoot: pending[0] as string,
          pendingValidAt: Number(pending[4]),
          pendingEpochId: Number(pending[2]),
          pendingTotalCumulative: pending[3],
          poolFree: balance > totalCumulative - totalClaimed ? balance - (totalCumulative - totalClaimed) : 0n,
        });
      } catch {
        /* kolejny interwal */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [client]);
  return state;
}

function fmt(wei: bigint, digits = 0) {
  return Number(formatEther(wei)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** Godziny/minuty do momentu w przyszlosci - odliczanie do validAt. */
function untilText(secondsLeft: number) {
  if (secondsLeft <= 0) return 'ready to activate - anyone can call activate()';
  const d = Math.floor(secondsLeft / 86_400);
  const h = Math.floor((secondsLeft % 86_400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  return d > 0 ? `in ${d}d ${h}h ${m}m` : `in ${h}h ${m}m`;
}

const utcStamp = (ts: number) => new Date(ts * 1000).toISOString().slice(5, 16).replace('T', ' ');

/**
 * PERMISSIONLESS DELIVERY - przycisk Claim widoczny dla KAZDEGO, nie tylko
 * dla tworcy. claim() w dystrybutorze jest bezuprawnieniowy jak claimFor
 * w padzie: ktokolwiek placi gaz, tokeny ZAWSZE ida do konta z liscia
 * (kontrakt sam wymusza odbiorce). Wczesniej goscie widzieli tylko tor
 * strumienia i podpis "tworca zobaczy tu przycisk" - wygladalo, jakby
 * przycisku nie bylo wcale. Doktryna KeeperSection (deliver/release sa
 * celowo publiczne, protokol ma przezyc milczenie zespolu) w wersji nagrod.
 */
function DeliverRow({ leaf, earned }: { leaf: Leaf; earned?: Earned }) {
  const client = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const { data: walletClient } = useWalletClient();
  const { address: caller } = useAccount();
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const [claimedSoFar, setClaimedSoFar] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!client || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    try {
      const [c, v] = await Promise.all([
        client.readContract({ address: SPHERE_DISTRIBUTOR_ADDRESS, abi: distributorAbi, functionName: 'claimed', args: [leaf.account as Address] }),
        client.readContract({
          address: SPHERE_DISTRIBUTOR_ADDRESS,
          abi: distributorAbi,
          functionName: 'vestedOf',
          args: [BigInt(leaf.cumulative), BigInt(leaf.prevCumulative)],
        }),
      ]);
      setClaimedSoFar(c);
      setClaimable(v > c ? v - c : 0n);
    } catch {
      /* kolejny interwal */
    }
  }, [client, leaf]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const onDeliver = async () => {
    if (!walletClient || !client || !caller || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    setBusy(true);
    setNote(null);
    try {
      const hash = await walletClient.writeContract({
        address: SPHERE_DISTRIBUTOR_ADDRESS,
        abi: distributorAbi,
        functionName: 'claim',
        args: [leaf.account as Address, BigInt(leaf.cumulative), BigInt(leaf.prevCumulative), (leaf.proof ?? []) as `0x${string}`[]],
        chain: SPHERE_CHAIN,
        account: caller,
      });
      await client.waitForTransactionReceipt({ hash });
      setNote({ kind: 'ok', text: `Delivered. tx ${hash.slice(0, 10)}…` });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      setNote({ kind: 'error', text: msg.includes('NothingToClaim') ? 'Nothing unlocked since the last claim - the stream releases linearly.' : msg.slice(0, 140) });
    } finally {
      setBusy(false);
    }
  };

  const allocated = BigInt(leaf.cumulative);
  return (
    <div className="rounded-2xl bg-sp-sunken px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0">
          <span className="block font-mono text-[11.5px] font-bold text-sp-ink">
            {leaf.account.slice(0, 6)}…{leaf.account.slice(-4)}
          </span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">
            {!earned
              ? 'creator wallet'
              : earned.symbols.length === 0
                ? `creator wallet · carried over from earlier epochs`
                : `creator of ${earned.symbols.join(' · ')} · epoch ${earned.epoch} · ${(earned.shareBps / 100).toFixed(2)}% share`}
            {earned && (
              <>
                {' · '}
                <a href={earned.manifestUrl} target="_blank" rel="noreferrer" className="normal-case tracking-normal text-sp-brand hover:underline">
                  why this amount ↗
                </a>
              </>
            )}
          </span>
        </span>
        {/* Trzy dokladne liczby na wiersz zamiast jednej: przydzial z liscia,
            ile juz wyszlo z kontraktu i ile mozna wziac w tej sekundzie. */}
        <span className="ml-auto text-right">
          <span className="block font-mono text-[11.5px] font-bold text-sp-shade/60">{fmt(allocated, 2)}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">allocated (cumulative)</span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-[11.5px] font-bold text-sp-shade/60">{claimedSoFar === null ? '…' : fmt(claimedSoFar, 2)}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">claimed</span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-[11.5px] font-bold text-sp-ink">{claimable === null ? '…' : fmt(claimable, 2)}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">claimable now (SPHERE)</span>
        </span>
        <button
          type="button"
          disabled={busy || !walletClient || claimable === null || claimable === 0n}
          onClick={() => void onDeliver()}
          className="inline-flex items-center gap-1.5 rounded-full bg-soft-primary px-3.5 py-1.5 text-[11.5px] font-extrabold text-sp-on-brand disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Gift className="h-3 w-3" aria-hidden="true" />}
          Claim for creator
        </button>
      </div>
      {note && <p className={`mt-1.5 text-[10.5px] font-bold ${note.kind === 'ok' ? 'text-sp-up' : 'text-sp-down'}`}>{note.text}</p>}
    </div>
  );
}

/**
 * Pasek nastepnej epoki - czytany z pending() i pokazywany TAKZE wtedy, gdy
 * biezaca epoka juz plynie. To jest odpowiedz na "ile i kiedy": kwota
 * przyrostu (pendingTotalCumulative - totalCumulative), odliczanie do validAt
 * i - dla podlaczonego tworcy - jego wlasny udzial z manifestu tej propozycji.
 */
function NextEpochStrip({ dist, next, account }: { dist: DistributorState; next: Resolved | null; account?: Address }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);
  if (dist.pendingValidAt === 0) return null;
  const delta = dist.pendingTotalCumulative > dist.totalCumulative ? dist.pendingTotalCumulative - dist.totalCumulative : 0n;
  const mine = account ? next?.leaves.find((l) => l.account.toLowerCase() === account.toLowerCase()) : undefined;
  const mineDelta = mine ? BigInt(mine.cumulative) - BigInt(mine.prevCumulative) : null;
  const payees = next ? next.leaves.filter((l) => BigInt(l.cumulative) > BigInt(l.prevCumulative)).length : null;
  const vetoHours = Math.round(dist.minDelaySeconds / 3600);
  return (
    <div className="mt-3 rounded-2xl border border-sp-brand/25 bg-sp-brand/[0.06] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-sp-brand">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Next epoch #{dist.pendingEpochId} proposed{next ? ` (season epoch ${next.epoch})` : ''}
        </span>
        <span className="text-right">
          <span className="block font-mono text-[12px] font-bold text-sp-ink">{fmt(delta, 2)}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">adds (SPHERE)</span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-[12px] font-bold text-sp-ink">{fmt(dist.pendingTotalCumulative, 2)}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">new cumulative total</span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-[12px] font-bold text-sp-ink">{payees === null ? '…' : payees}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">creators paid</span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-[12px] font-bold text-sp-ink">{utcStamp(dist.pendingValidAt)}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">claimable from (UTC)</span>
        </span>
        <span className="ml-auto rounded-full bg-sp-brand/15 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">
          {untilText(dist.pendingValidAt - now)}
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] text-sp-shade/55">
        {mineDelta !== null
          ? `Your wallet is in this proposal for ${fmt(mineDelta, 2)} SPHERE; it starts unlocking at activation and streams over ${Math.round(dist.streamSeconds / 86_400)} days.`
          : account && next
            ? 'Your wallet has no leaf in this proposal - it pays creators whose tokens brought external volume in that epoch.'
            : `The ${vetoHours}h veto window is enforced by the contract (MIN_DELAY is immutable): a wrong list can be stopped before any token moves.`}
      </p>
    </div>
  );
}

/**
 * JEDNA LINIJKA O GWARANCJACH - dokladnie tyle, ile daje kontrakt, ani slowa
 * wiecej. Wczesniej strona pisala "nagrody nigdy nie przepadaja", co jest
 * mocniejsze niz SphereStreamingMerkleDistributor.sol: ShrinkingTotal broni
 * tylko GLOBALNEJ sumy, a claim() sprawdza proof przeciw AKTYWNEMU rootowi.
 */
function GuaranteeNote() {
  return (
    <p className="mt-2 text-[10.5px] text-sp-shade/45">
      What the contract actually guarantees: each new root must carry a total no smaller than the previous one (it reverts
      with <span className="font-mono">ShrinkingTotal</span>), and there is no deadline on claiming what is already
      unlocked under the active root. Carrying an unclaimed balance forward is not enforced on chain - claims verify
      against the active root only, so it depends on the proposer including your past balance in every new root.
    </p>
  );
}

/** Ta sama karta bez zewnetrznego stanu - do osadzenia na innych podstronach (Rewards). */
export function SphereRewardsClaimStandalone() {
  const dist = useSphereDistributor();
  return <SphereRewardsClaim dist={dist} />;
}

export default function SphereRewardsClaim({ dist }: { dist: DistributorState | null }) {
  const { address: account } = useAccount();
  const client = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const { data: walletClient } = useWalletClient();
  const [claimedWei, setClaimedWei] = useState<bigint>(0n);
  const [vestedWei, setVestedWei] = useState<bigint>(0n);
  /** claimed(account) czytane ZAWSZE - takze dla konta bez liscia, zeby
   *  "nie masz nagrody w tej epoce" mogl podac konkretna liczbe. */
  const [accountClaimed, setAccountClaimed] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Manifest AKTYWNEGO roota (shown) oraz - osobno - manifest roota
  // ZAPROPONOWANEGO (next). Oba dopasowane po polu `root`, nie po latest.json.
  const [shown, setShown] = useState<Resolved | null>(null);
  const [next, setNext] = useState<Resolved | null>(null);
  const [manifestFailed, setManifestFailed] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hasEpoch = Boolean(dist && (dist.live || dist.pendingValidAt > 0));
  const distRoot = dist?.root;
  const distPendingRoot = dist?.pendingRoot;
  const distLive = dist?.live;

  useEffect(() => {
    if (!hasEpoch) {
      setShown(null);
      setNext(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        // Blob najpierw (tam publikuje automat epoki bez deployu), potem kopia
        // z repo pod public/. Oba to ten sam plik; manifestHash w kontrakcie
        // rozstrzyga, ktory jest prawdziwy.
        // Host Bloba to id sklepu bez prefiksu `store_`, malymi literami
        // (env trzyma "store_SaqX..." - w cudzyslowie i z wielkimi literami).
        const storeId = (process.env.NEXT_PUBLIC_VERCEL_BLOB_STORE_ID ?? '').replace(/["']/g, '').replace(/^store_/i, '').toLowerCase();
        const sources = storeId ? [`https://${storeId}.public.blob.vercel-storage.com/sphere-epochs`, '/sphere-epochs'] : ['/sphere-epochs'];
        const getJson = async <T,>(name: string): Promise<T> => {
          let lastErr: unknown = null;
          for (const base of sources) {
            try {
              const r = await fetch(`${base}/${name}`, { cache: 'no-store' });
              if (r.ok) return (await r.json()) as T;
              lastErr = new Error(String(r.status));
            } catch (e) {
              lastErr = e;
            }
          }
          throw lastErr ?? new Error('manifest unavailable');
        };

        const l = await getJson<Latest>('latest.json');
        if (!alive) return;

        /** "Za co": tokeny tworcy z manifestu + udzial z wyniku; symbole
         *  z lancucha (manifest ich nie trzyma - liczy sie z adresow). */
        const describe = async (m: Manifest, epoch: number): Promise<Resolved> => {
          const all = m.leaves ?? [];
          const shares = new Map((m.result?.creators ?? []).map((c) => [c.creator.toLowerCase(), Number(c.shareBps)]));
          const inputs = m.inputs ?? [];
          const earned: Record<string, Earned> = {};
          for (const lf of all) {
            const key = lf.account.toLowerCase();
            const tokens = inputs.filter((i) => i.creator.toLowerCase() === key).map((i) => i.token);
            const symbols = await Promise.all(
              tokens.map(async (t) => {
                try {
                  if (!client) throw new Error('no client');
                  return (await client.readContract({ address: t as Address, abi: erc20SymbolAbi, functionName: 'symbol' })) as string;
                } catch {
                  return `${t.slice(0, 6)}…${t.slice(-4)}`;
                }
              })
            );
            earned[key] = { symbols, shareBps: shares.get(key) ?? 0, epoch, manifestUrl: `/sphere-epochs/epoch-${epoch}.json` };
          }
          return { epoch, leaves: all, earned, manifestHash: String(m.manifestHash ?? '') };
        };

        /**
         * Szukamy manifestu o ZADANYM roocie, schodzac od najnowszego. Osiem
         * plikow w tyl wystarcza z zapasem (epoka = tydzien), a brak trafienia
         * jest sygnalem, ze publikacja nie nadaza za lancuchem - wtedy lepiej
         * nie pokazac nic niz pokazac cudze liscie.
         */
        const findByRoot = async (want: string | undefined): Promise<Resolved | null> => {
          if (!want || want === ZERO32) return null;
          for (let i = l.epoch; i >= 0 && i > l.epoch - 8; i--) {
            try {
              const m = await getJson<Manifest>(`epoch-${i}.json`);
              if ((m.root ?? '').toLowerCase() === want.toLowerCase()) return await describe(m, i);
            } catch {
              /* brak pliku dla tego numeru - szukamy dalej */
            }
          }
          return null;
        };

        const active = distLive ? await findByRoot(distRoot) : null;
        const proposed = await findByRoot(distPendingRoot);
        if (!alive) return;
        setShown(distLive ? active : proposed);
        setNext(distLive ? proposed : null);
        setManifestFailed(distLive ? active === null : proposed === null);
      } catch {
        if (alive) {
          setShown(null);
          setNext(null);
          setManifestFailed(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [hasEpoch, distLive, distRoot, distPendingRoot, client]);

  /** Lisc konta w pokazywanym manifescie: null = jeszcze czytamy, 'none' = nie ma. */
  const leaf: Leaf | null | 'none' = useMemo(() => {
    if (!shown) return manifestFailed ? 'none' : null;
    if (!account) return null;
    return shown.leaves.find((x) => x.account.toLowerCase() === account.toLowerCase()) ?? 'none';
  }, [shown, account, manifestFailed]);

  const refresh = useCallback(async () => {
    if (!client || !account || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    const c = await client.readContract({ address: SPHERE_DISTRIBUTOR_ADDRESS, abi: distributorAbi, functionName: 'claimed', args: [account] });
    setAccountClaimed(c);
    setClaimedWei(c);
    if (!leaf || leaf === 'none') return;
    const v = await client.readContract({
      address: SPHERE_DISTRIBUTOR_ADDRESS,
      abi: distributorAbi,
      functionName: 'vestedOf',
      args: [BigInt(leaf.cumulative), BigInt(leaf.prevCumulative)],
    });
    setVestedWei(v);
  }, [client, account, leaf]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!dist) return null;

  const card = 'sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5';
  const head = (
    <h3 className="flex items-center gap-2 text-[13.5px] font-extrabold text-sp-ink">
      <Gift className="h-4 w-4 text-sp-brand" aria-hidden="true" /> Your SPHERE rewards
    </h3>
  );
  const vetoHours = Math.round(dist.minDelaySeconds / 3600);

  /**
   * WYRAZNE "nie masz tu nic" dla podlaczonego portfela bez liscia - z liczba
   * z lancucha, a nie pusta karta. Konto bez nagrody widzi wprost: 0 w tej
   * epoce, tyle odebrane w calej historii dystrybutora.
   */
  const noLeafNote = (epochLabel: string) =>
    accountClaimed === null
      ? `This wallet has no leaf in ${epochLabel} - reading its claim history from the distributor...`
      : `This wallet has no leaf in ${epochLabel}: 0 SPHERE accrued there, ${fmt(accountClaimed, 2)} SPHERE claimed from this distributor in total. Rewards go to creators whose tokens brought real external volume; see the leaderboard below.`;

  if (!dist.live) {
    if (dist.pendingValidAt === 0) {
      return (
        <section className={card}>
          {head}
          <p className="mt-1 text-[11.5px] text-sp-shade/55">
            No paid epoch yet. Rewards start streaming once the first root is proposed and activated.
          </p>
          <GuaranteeNote />
        </section>
      );
    }
    // PODGLAD ZAPROPONOWANEJ EPOKI: dane z manifestu (hash w kontrakcie),
    // harmonogram z kontraktu. Nic nie plynie, dopoki root nie jest aktywny -
    // i tak to jest podpisane.
    const startsAt = dist.pendingValidAt;
    const endsAt = startsAt + dist.streamSeconds;
    const secsLeft = Math.max(0, startsAt - Math.floor(tick / 1000));
    const proposedTotal = dist.pendingTotalCumulative;
    const mineLeaf = leaf && leaf !== 'none' ? leaf : null;
    const mineTotal = mineLeaf ? BigInt(mineLeaf.cumulative) - BigInt(mineLeaf.prevCumulative) : 0n;
    const perHour = mineLeaf && dist.streamSeconds > 0 ? (mineTotal * 3600n) / BigInt(dist.streamSeconds) : 0n;
    return (
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {head}
            <p className="mt-1 text-[11px] text-sp-shade/50">
              Epoch #{dist.pendingEpochId} {shown ? `(season epoch ${shown.epoch})` : ''} · proposed, in the {vetoHours}h veto
              window · nothing streams until activation
            </p>
          </div>
          <span className="rounded-full bg-sp-brand/10 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">
            {secsLeft > 0 ? `streaming starts ${untilText(secsLeft)}` : 'waiting for activation (anyone can call it)'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Proposed this epoch', fmt(proposedTotal - dist.totalCumulative, 2)],
            ['Creators paid', String(shown ? shown.leaves.filter((x) => BigInt(x.cumulative) > BigInt(x.prevCumulative)).length : '…')],
            ['Stream starts (UTC)', utcStamp(startsAt)],
            ['Fully unlocked (UTC)', utcStamp(endsAt)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-sp-sunken p-3">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">{label}</p>
              <p className="mt-1 font-soft-display text-[18px] font-extrabold leading-none text-sp-ink">
                {value} {label === 'Proposed this epoch' && <span className="text-[11px] text-sp-shade/45">SPHERE</span>}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <StreamLane
            total={mineLeaf ? BigInt(mineLeaf.cumulative) : proposedTotal}
            prev={mineLeaf ? BigInt(mineLeaf.prevCumulative) : dist.totalCumulative}
            claimed={0n}
            activatedAt={0}
            streamSeconds={dist.streamSeconds}
            active={false}
            startsAt={startsAt}
          />
          {!mineLeaf && (
            <p className="mt-1 text-[10px] text-sp-shade/40">The lane above shows the whole epoch&apos;s allocation; connect a creator wallet to see your own.</p>
          )}
        </div>
        <p className="mt-3 text-[11.5px] text-sp-shade/60">
          {!account
            ? 'Connect the wallet you launch tokens with to see your proposed allocation.'
            : mineLeaf
              ? `Your proposed allocation: ${fmt(mineTotal, 2)} SPHERE. It will unlock at about ${fmt(perHour, 2)} SPHERE per hour from activation, and you can claim any time while this root is active.`
              : leaf === null
                ? 'Reading the epoch manifest...'
                : noLeafNote(`the proposed epoch #${dist.pendingEpochId}`)}
        </p>
        <p className="mt-1 text-[10.5px] text-sp-shade/40">
          The {vetoHours}h window is enforced by the contract (MIN_DELAY is immutable): a wrong list can be stopped before any token moves. Root and manifest hash: distributor{' '}
          <a href={`${SPHERE_EXPLORER_URL}/address/${SPHERE_DISTRIBUTOR_ADDRESS}`} target="_blank" rel="noreferrer" className="font-bold text-sp-brand hover:underline">
            {SPHERE_DISTRIBUTOR_ADDRESS?.slice(0, 8)}…
          </a>
        </p>
        <GuaranteeNote />
      </section>
    );
  }

  // STRUMIEN EPOKI dla kazdego - takze bez portfela i bez wlasnej nagrody.
  // To publiczne liczby z manifestu (hash stoi w kontrakcie), wiec nie ma
  // powodu chowac ich za logowaniem; po aktywacji karta znikala gosciom i
  // wygladalo to, jakby streaming przestal istniec. Wlasny udzial i Claim -
  // nizej, tylko dla konta z lisciem.
  const liveElapsed = Math.max(0, Math.floor(tick / 1000) - dist.activatedAt);
  const livePct = dist.streamSeconds > 0 ? Math.min(100, (liveElapsed / dist.streamSeconds) * 100) : 100;
  const rows = shown?.leaves ?? [];
  const epochTotal = rows.length ? rows.reduce((a, x) => a + BigInt(x.cumulative), 0n) : dist.totalCumulative;
  const epochPrev = rows.length ? rows.reduce((a, x) => a + BigInt(x.prevCumulative), 0n) : 0n;
  const paidCount = rows.filter((x) => BigInt(x.cumulative) > BigInt(x.prevCumulative)).length;
  const activeLabel = `the active epoch #${dist.epochId}`;
  const epochHead = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {head}
        <p className="mt-1 text-[11px] text-sp-shade/50">
          Epoch #{dist.epochId} {shown ? `(season epoch ${shown.epoch}, closed)` : ''} · streaming {livePct.toFixed(1)}% ·
          allocated {fmt(dist.totalCumulative, 2)} SPHERE · claimed {fmt(dist.totalClaimed, 2)} · free pool{' '}
          {fmt(dist.poolFree)} SPHERE
        </p>
      </div>
      <a
        href={`${SPHERE_EXPLORER_URL}/address/${SPHERE_DISTRIBUTOR_ADDRESS}`}
        target="_blank"
        rel="noreferrer"
        className="text-[10.5px] font-extrabold text-sp-shade/45 hover:text-sp-brand"
      >
        distributor ↗
      </a>
    </div>
  );
  const reading = (
    <section className={card}>
      {epochHead}
      <p className="mt-2 inline-flex items-center gap-2 text-[11.5px] text-sp-shade/55">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading the epoch manifest...
      </p>
      <NextEpochStrip dist={dist} next={next} account={account} />
    </section>
  );
  const epochView = (note: string) => (
    <section className={card}>
      {epochHead}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['This epoch', fmt(epochTotal - epochPrev, 2)],
          ['Creators paid', String(paidCount)],
          ['Streaming since (UTC)', utcStamp(dist.activatedAt)],
          ['Fully unlocked (UTC)', utcStamp(dist.activatedAt + dist.streamSeconds)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-sp-sunken p-3">
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">{label}</p>
            <p className="mt-1 font-soft-display text-[18px] font-extrabold leading-none text-sp-ink">
              {value} {label === 'This epoch' && <span className="text-[11px] text-sp-shade/45">SPHERE</span>}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <StreamLane
          total={epochTotal}
          prev={epochPrev}
          claimed={dist.totalClaimed}
          activatedAt={dist.activatedAt}
          streamSeconds={dist.streamSeconds}
          active
        />
        <p className="mt-1 text-[10px] text-sp-shade/40">
          The lane above is the whole epoch&apos;s allocation unlocking on chain; a creator wallet additionally sees its own share here.
        </p>
      </div>
      <NextEpochStrip dist={dist} next={next} account={account} />
      {rows.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">
            Deliver rewards - anyone can press this
          </p>
          <p className="mt-0.5 text-[10px] text-sp-shade/40">
            claim() is permissionless: whoever clicks pays the gas, tokens always land in the creator&apos;s wallet.
            {!account ? ' Connect any wallet to send it.' : ''}
          </p>
          <div className="mt-1.5 grid gap-1.5">
            {rows.map((l) => (
              <DeliverRow key={l.account} leaf={l} earned={shown?.earned[l.account.toLowerCase()]} />
            ))}
          </div>
          {/* Wyplaty ida z OPOZNIENIEM O EPOKE - ten strumien rozlicza zamknieta
              epoke z manifestu, a leaderboard nizej pokazuje epoke w toku. Bez
              tego zdania nagroda dla tworcy z 5. miejsca biezacej listy
              wygladala jak nagroda dla kogos spoza listy. */}
          <p className="mt-1.5 text-[10px] text-sp-shade/40">
            Paid one epoch in arrears: this stream settles{shown ? ` season epoch ${shown.epoch}` : ' the last closed epoch'} from its
            published manifest. The leaderboard below is the epoch in progress - it pays out after it closes.
          </p>
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-sp-shade/60">{note}</p>
      <GuaranteeNote />
    </section>
  );

  if (shown === null && !manifestFailed) return reading;
  if (!account) return epochView('Connect the wallet you launch tokens with to see and claim your share.');
  if (leaf === null) return reading;
  if (leaf === 'none') return epochView(noLeafNote(activeLabel));

  const total = BigInt(leaf.cumulative);
  const prev = BigInt(leaf.prevCumulative);
  const claimable = vestedWei > claimedWei ? vestedWei - claimedWei : 0n;
  const elapsed = Math.max(0, Math.floor(tick / 1000) - dist.activatedAt);
  const streamPct = dist.streamSeconds > 0 ? Math.min(100, (elapsed / dist.streamSeconds) * 100) : 100;

  const onClaim = async () => {
    if (!walletClient || !client || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    setBusy(true);
    setNotice(null);
    try {
      const hash = await walletClient.writeContract({
        address: SPHERE_DISTRIBUTOR_ADDRESS,
        abi: distributorAbi,
        functionName: 'claim',
        args: [account, total, prev, (leaf.proof ?? []) as `0x${string}`[]],
        chain: SPHERE_CHAIN,
        account,
      });
      await client.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'ok', text: `Claimed. tx ${hash.slice(0, 10)}…` });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      setNotice({ kind: 'error', text: msg.includes('NothingToClaim') ? 'Nothing unlocked yet - the stream releases linearly over the epoch.' : msg.slice(0, 140) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {head}
          <p className="mt-1 text-[11px] text-sp-shade/50">
            Epoch #{dist.epochId} {shown ? `(season epoch ${shown.epoch}, closed)` : ''} · streaming {streamPct.toFixed(1)}% ·
            paid one epoch in arrears · cumulative ledger, no claim deadline under the active root
          </p>
        </div>
        <a
          href={`${SPHERE_EXPLORER_URL}/address/${SPHERE_DISTRIBUTOR_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10.5px] font-extrabold text-sp-shade/45 hover:text-sp-brand"
        >
          distributor ↗
        </a>
      </div>
      <div className="mt-3">
        <StreamLane
          total={total}
          prev={prev}
          claimed={claimedWei}
          activatedAt={dist.activatedAt}
          streamSeconds={dist.streamSeconds}
          active
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Allocated (all epochs)', fmt(total, 2)],
          ['This epoch', fmt(total - prev, 2)],
          ['Unlocked (chain read)', fmt(vestedWei, 2)],
          ['Claimed', fmt(claimedWei, 2)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-sp-sunken p-3">
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">{label}</p>
            <p className="mt-1 font-soft-display text-[18px] font-extrabold leading-none text-sp-ink">
              {value} <span className="text-[11px] text-sp-shade/45">SPHERE</span>
            </p>
          </div>
        ))}
      </div>
      <NextEpochStrip dist={dist} next={next} account={account} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || claimable === 0n}
          onClick={() => void onClaim()}
          className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2 text-[12.5px] font-extrabold text-sp-on-brand disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Gift className="h-3.5 w-3.5" aria-hidden="true" />}
          Claim {fmt(claimable, 2)} SPHERE
        </button>
        <span className="text-[10.5px] text-sp-shade/45">anyone can pay the gas; tokens always land in your wallet.</span>
      </div>
      {notice && (
        <p className={`mt-2 text-[11px] font-bold ${notice.kind === 'ok' ? 'text-sp-up' : 'text-sp-down'}`}>{notice.text}</p>
      )}
      <GuaranteeNote />
    </section>
  );
}
