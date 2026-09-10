'use client';

import { useState } from 'react';
import { maxUint256 } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DERIV_CHAIN,
  FACTORY_ADDRESS,
  ORACLE_ADDRESS,
  USDC_ADDRESS,
  erc20Abi,
  factoryAbi,
  oracleAbi,
} from './config';
import { fmtWadCompact, usdc, wad } from './format';

/**
 * ZALOZENIE RYNKU - trzy transakcje, w tej kolejnosci i nie inaczej.
 *
 *   1. approve USDC dla rejestru (kaucja schodzi z portfela tworcy),
 *   2. registerMarket - feed + kaucja + cena startowa,
 *   3. createMarket   - vAMM na tym feedzie.
 *
 * Cena vAMM NIE jest tu parametrem: fabryka bierze biezaca cene feedu. Gdyby
 * dalo sie ja podac osobno, tworca ustawilby mark daleko od indeksu i zbieral
 * funding od pierwszej minuty.
 *
 * Kaucja jest tym, co wyznacza limit OI rynku (maxOI = kaucja * mnoznik), wiec
 * pole ponizej pokazuje od razu, jak duzy bedzie rynek na probacji i po
 * dojrzeniu - inaczej ta liczba wygladalaby na formalnosc.
 */
export default function CreateMarketModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const { data: wallet } = useWalletClient();

  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState('');
  const [bond, setBond] = useState('1000');
  const [liquidity, setLiquidity] = useState('100000');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bondAmount = usdc(bond);
  const startPrice = wad(price);
  const vliq = wad(liquidity);
  const wrongChain = chainId !== DERIV_CHAIN.id;
  const ready = Boolean(symbol.trim() && startPrice && bondAmount && vliq && address && !wrongChain);

  // maxOI = kaucja * mnoznik. Mnozniki sa stalymi w kontrakcie (2 i 8).
  const probationCap = bondAmount ? bondAmount * 10n ** 12n * 2n : 0n;
  const matureCap = bondAmount ? bondAmount * 10n ** 12n * 8n : 0n;

  async function submit() {
    if (!wallet || !client || !ready || !bondAmount || !startPrice || !vliq) return;
    setError(null);
    try {
      setBusy('Sprawdzam zgode na USDC...');
      const allowance = (await client.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address!, ORACLE_ADDRESS],
      })) as bigint;

      if (allowance < bondAmount) {
        setBusy('Zatwierdz USDC dla rejestru...');
        const hash = await wallet.writeContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [ORACLE_ADDRESS, maxUint256],
          chain: DERIV_CHAIN,
          account: address!,
        });
        await client.waitForTransactionReceipt({ hash });
      }

      setBusy('Rejestruje feed i wplacam kaucje...');
      const registerHash = await wallet.writeContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'registerMarket',
        args: [symbol.trim(), startPrice, bondAmount],
        chain: DERIV_CHAIN,
        account: address!,
      });
      await client.waitForTransactionReceipt({ hash: registerHash });

      // Id feedu to licznik PO rejestracji - rejestr numeruje od jedynki.
      const marketId = (await client.readContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'marketCount',
      })) as bigint;

      setBusy('Stawiam vAMM...');
      const createHash = await wallet.writeContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: 'createMarket',
        args: [marketId, vliq, '0x0000000000000000000000000000000000000000'],
        chain: DERIV_CHAIN,
        account: address!,
      });
      await client.waitForTransactionReceipt({ hash: createHash });

      setBusy(null);
      onCreated();
    } catch (e: any) {
      setBusy(null);
      setError(e?.shortMessage || e?.message || 'Transakcja odrzucona.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nowy rynek</DialogTitle>
          <DialogDescription>
            Wystawiasz feed ceny i stawiasz na nim vAMM. Kaucja zostaje w rejestrze i wyznacza limit OI rynku.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="deriv-symbol">Symbol</Label>
            <Input
              id="deriv-symbol"
              placeholder="kASK-USD"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              maxLength={24}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deriv-price">Cena startowa (USD)</Label>
            <Input
              id="deriv-price"
              inputMode="decimal"
              placeholder="100"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            {price && !startPrice && <p className="text-xs text-destructive">To nie jest liczba dziesietna.</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deriv-bond">Kaucja (USDC)</Label>
            <Input
              id="deriv-bond"
              inputMode="decimal"
              placeholder="1000"
              value={bond}
              onChange={(e) => setBond(e.target.value)}
            />
            {bondAmount ? (
              <p className="text-xs text-muted-foreground">
                Limit OI: {fmtWadCompact(probationCap)} na probacji, {fmtWadCompact(matureCap)} po dojrzeniu
                (7 dni i 50 przyjetych cen bez zgloszenia).
              </p>
            ) : (
              <p className="text-xs text-destructive">Minimum to 100 USDC.</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deriv-liq">Glebokosc vAMM (USD)</Label>
            <Input
              id="deriv-liq"
              inputMode="decimal"
              placeholder="100000"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Im wieksza, tym mniejszy poslizg. Minimum 1 000 USD.
            </p>
          </div>

          {wrongChain && (
            <p className="text-xs text-destructive">Przelacz portfel na siec {DERIV_CHAIN.name}.</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(busy)}>
            Anuluj
          </Button>
          <Button onClick={() => void submit()} disabled={!ready || Boolean(busy)}>
            {busy ?? 'Zaloz rynek'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
