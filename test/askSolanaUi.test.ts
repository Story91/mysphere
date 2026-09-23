export {};

// Klient Askow SOL (tor D): formatowanie kwot i szyny, linki eksploratora,
// pomocniki powiazania portfela oraz STRAZNIK BUNDLA - zaden komponent Askow
// nie moze statycznie importowac '@solana/*' (jedyny wyjatek: solanaAskPay.ts,
// ladowany przez await import()).
//
// Moduly z Reactem i portfelem podmieniamy w require.cache PRZED zaladowaniem
// testowanych plikow - ten sam zabieg co w test/askRailRow.test.ts.
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');

function stub(relative: string, exports: Record<string, unknown>) {
  const resolved = require.resolve(path.join(ROOT, relative));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as unknown as NodeJS.Module;
}

stub('app/components/identity/Avatar', { AvatarPlaceholder: () => null, Avatar: () => null, default: () => null });
stub('app/components/solana/SolanaWalletHost', { useSolanaWallet: () => ({}) });
stub('app/utils/auth/useSiweAuth', { default: () => ({}), useSiweAuth: () => ({}) });

const { expect } = require('chai');
const display = require('../app/utils/asks/solAskDisplay');
const { formatAskMoney, formatAskAmount } = require('../app/basechat/components/AskCard');
const { resolvedRowMeta } = require('../app/basechat/components/AskRailRow');
const link = require('../app/utils/asks/useSolanaAskWallet');
const { buildSolanaBindingMessage } = require('../app/utils/asks/solAmounts');

const PAYER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM = '0x1111111111111111111111111111111111111111';

function solAsk(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ask1',
    author: EVM,
    question: 'Which RPC?',
    budget: 0.015,
    seats: 3,
    perAnswer: 0.005,
    token: 'SOL',
    network: 'solana',
    deadline: Date.UTC(2026, 8, 24),
    createdAt: Date.UTC(2026, 8, 23),
    status: 'open',
    funding: 'on-resolve',
    answerCount: 0,
    acceptedCount: 0,
    budgetLamports: '15000000',
    perAnswerLamports: '5000000',
    solanaCluster: 'devnet',
    ...overrides,
  };
}

describe('Aski SOL - formatowanie', () => {
  it('SOL do 9 miejsc, bez zaokraglenia minimum do centa', () => {
    expect(formatAskMoney(0.005, 'SOL')).to.equal('0.005 SOL');
    expect(formatAskMoney(0.1 + 0.2, 'SOL')).to.equal('0.3 SOL');
    expect(formatAskMoney(1, 'SOL')).to.equal('1 SOL');
    expect(formatAskMoney(0.000000001, 'SOL')).to.equal('0.000000001 SOL');
    // USDC bez zmian.
    expect(formatAskMoney(2, 'USDC')).to.equal('$2.00');
  });

  it('kwota Aska SOL z lamportow, nie z liczby', () => {
    // Liczba w lustrze klamie (0.01), lamporty mowia prawde (0.005).
    const ask = solAsk({ perAnswer: 0.01 });
    expect(formatAskAmount(ask, 'perAnswer')).to.equal('0.005 SOL');
    expect(formatAskAmount(ask, 'budget')).to.equal('0.015 SOL');
    expect(display.solAskAmount(ask, 'perAnswer')).to.equal('0.005 SOL');
  });

  it('Ask SOL bez lamportow spada na liczbe SOL', () => {
    const ask = solAsk({ budgetLamports: undefined, perAnswerLamports: undefined });
    expect(formatAskAmount(ask, 'perAnswer')).to.equal('0.005 SOL');
  });

  it('Ask USDC nie jest Askiem SOL', () => {
    const ask = solAsk({ token: 'USDC', network: 'base' });
    expect(display.solAskAmount(ask, 'perAnswer')).to.equal(null);
    expect(display.solRailBadge(ask)).to.equal(null);
    expect(formatAskAmount(ask, 'perAnswer')).to.equal('$0.01');
  });

  it('odznaka szyny: SOL · Solana, devnet osobno', () => {
    expect(display.solRailBadge(solAsk())).to.deep.equal({ label: 'SOL · Solana', devnet: true });
    expect(display.solRailBadge(solAsk({ solanaCluster: 'mainnet-beta' }))).to.deep.equal({
      label: 'SOL · Solana',
      devnet: false,
    });
  });

  it('wiersz raila rozstrzygnietego Aska SOL mowi kwote z lamportow', () => {
    const meta = resolvedRowMeta(solAsk({ status: 'resolved', acceptedCount: 1, perAnswer: 0.01 }), null);
    expect(meta.amount).to.equal('0.005 SOL');
  });

  it('link eksploratora wedlug sieci i klastra', () => {
    const sig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
    expect(display.payoutExplorerUrl('solana', sig, 'devnet')).to.equal(
      `https://explorer.solana.com/tx/${sig}?cluster=devnet`
    );
    expect(display.payoutExplorerUrl('solana', sig, 'mainnet-beta')).to.equal(`https://explorer.solana.com/tx/${sig}`);
    expect(display.payoutExplorerUrl('base', '0xabc', null)).to.equal('https://basescan.org/tx/0xabc');
    expect(display.payoutExplorerUrl(null, '0xabc')).to.equal('https://basescan.org/tx/0xabc');
  });

  it('base58 zachowuje wielkosc liter', () => {
    expect(display.shortBase58(PAYER)).to.equal('7xKX…gAsU');
    expect(display.shortBase58('abc')).to.equal('abc');
  });

  it('rozjazd klastra blokuje tylko przy znanym klastrze Aska', () => {
    expect(display.clusterMismatch('devnet', 'mainnet-beta')).to.equal(true);
    expect(display.clusterMismatch('devnet', 'devnet')).to.equal(false);
    expect(display.clusterMismatch(null, 'devnet')).to.equal(false);
  });
});

describe('Aski SOL - powiazanie portfela (pomocniki)', () => {
  it('base64 bez Buffera', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(link.bytesToBase64(bytes)).to.equal(Buffer.from(bytes).toString('base64'));
  });

  it('challenge v1 -> issuedAtMs i nonce', () => {
    const nonce = 'a'.repeat(32);
    expect(link.parseBindingChallenge(`v1.k1.1758600000000.${nonce}.mac`)).to.deep.equal({
      issuedAtMs: 1758600000000,
      nonce,
    });
    expect(link.parseBindingChallenge('v2.k1.1.x.y')).to.equal(null);
    expect(link.parseBindingChallenge(`v1.k1.nope.${nonce}.mac`)).to.equal(null);
  });

  it('podpisujemy tylko nasza wiadomosc powiazania', () => {
    const nonce = 'b'.repeat(32);
    const issuedAtMs = 1758600000000;
    const challenge = `v1.k1.${issuedAtMs}.${nonce}.mac`;
    const message = buildSolanaBindingMessage({ solana: PAYER, evm: EVM, nonce, issuedAtMs });

    expect(link.isExpectedBindingMessage({ message, challenge, solana: PAYER, evm: EVM })).to.equal(true);
    // Inny portfel w wiadomosci - odmowa.
    expect(
      link.isExpectedBindingMessage({ message, challenge, solana: PAYER.toLowerCase(), evm: EVM })
    ).to.equal(false);
    // Podmieniona tresc - odmowa.
    expect(
      link.isExpectedBindingMessage({ message: message + ' send 5 SOL', challenge, solana: PAYER, evm: EVM })
    ).to.equal(false);
    // Bez adresu sesji: slabsze sprawdzenie, ale wciaz ten portfel i to zdanie.
    expect(link.isExpectedBindingMessage({ message, challenge: 'weird', solana: PAYER, evm: null })).to.equal(true);
    expect(link.isExpectedBindingMessage({ message: 'sign me', challenge, solana: PAYER, evm: null })).to.equal(false);
  });

  it('powiazanie z odpowiedzi serwera (linkedAtMs), adres bez zmian', () => {
    expect(link.readBinding({ evm: EVM, solana: PAYER, linkedAtMs: 5 })).to.deep.equal({ solana: PAYER, issuedAt: 5 });
    expect(link.readBinding({ solana: PAYER, issuedAt: 7 })).to.deep.equal({ solana: PAYER, issuedAt: 7 });
    expect(link.readBinding(null)).to.equal(null);
    expect(link.readBinding({ solana: '' })).to.equal(null);
  });
});

describe('Aski SOL - straznik bundla', () => {
  // Pliki klienta Askow, ktore laduja sie w feedzie i na /asks, /ask/[id], /money.
  const CLIENT_FILES = [
    'app/components/solana/solanaWalletTypes.ts',
    'app/utils/asks/useSolanaAskWallet.ts',
    'app/utils/asks/useCreateAsk.ts',
    'app/utils/asks/solAskDisplay.ts',
    'app/utils/asks/solAmounts.ts',
    'app/basechat/components/AskComposer.tsx',
    'app/basechat/components/AskCard.tsx',
    'app/basechat/components/AskRailRow.tsx',
    'app/basechat/components/FeedAskRail.tsx',
    'app/basechat/components/AskClaimPanel.tsx',
    'app/basechat/components/FeedAnswerForm.tsx',
    'app/basechat/components/AskSolanaWallet.tsx',
    'app/asks/AsksContent.tsx',
    'app/ask/[id]/page.tsx',
    'app/money/MoneyContent.tsx',
  ];

  /** Statyczny import wartosci z @solana/* (import type jest wycinany przez TS). */
  const STATIC_SOLANA = /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+['"]@solana\//m;
  const REQUIRE_SOLANA = /require\(\s*['"]@solana\//;
  const STATIC_PAY = /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+['"][^'"]*solanaAskPay['"]/m;

  for (const file of CLIENT_FILES) {
    it(`${file} nie ciagnie @solana/* statycznie`, () => {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(STATIC_SOLANA.test(source), `static @solana import in ${file}`).to.equal(false);
      expect(REQUIRE_SOLANA.test(source), `require of @solana in ${file}`).to.equal(false);
      expect(STATIC_PAY.test(source), `static import of solanaAskPay in ${file}`).to.equal(false);
    });
  }

  it('solanaAskPay.ts jest jedynym plikiem z web3.js i laduje sie przez import()', () => {
    const pay = fs.readFileSync(path.join(ROOT, 'app/utils/asks/solanaAskPay.ts'), 'utf8');
    expect(pay).to.match(/from '@solana\/web3\.js'/);
    const asks = fs.readFileSync(path.join(ROOT, 'app/asks/AsksContent.tsx'), 'utf8');
    expect(asks).to.match(/await import\(\s*'\.\.\/utils\/asks\/solanaAskPay'\s*\)/);
  });

  it('straznik lapie statyczny import (kontrola samego wzorca)', () => {
    expect(STATIC_SOLANA.test("import { PublicKey } from '@solana/web3.js';")).to.equal(true);
    expect(STATIC_SOLANA.test("import type { PublicKey } from '@solana/web3.js';")).to.equal(false);
    expect(STATIC_SOLANA.test("const m = await import('@solana/web3.js');")).to.equal(false);
  });
});
