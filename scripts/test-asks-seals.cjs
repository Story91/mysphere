// Uruchamia testy czystej logiki bezpieczenstwa Askow: pieczecie HMAC,
// dopasowanie wyplat (test/asksSeals.test.ts) i dowody z kontraktu escrow
// (test/asksEscrowProof.test.ts) oraz magazyn Askow na atrapie Firestore
// (test/asksStore.test.ts).
//
// Ten sam runner co scripts/test-solana.cjs i z tego samego powodu: ts-node
// w trybie CommonJS laduje .ts z app/ bez zmian w kodzie aplikacji. Roznica
// jest jedna - moduly serwerowe Askow importuja 'server-only', ktory poza
// bundlem Nexta rzuca. Ten plik jest wiec tez wlasnym `-r` dla mochy: gdy
// mocha go laduje (require.main !== module), podmienia 'server-only' na pusty
// modul - tak samo jak scripts/solana-backfill-receipts.cjs. Czyste moduly
// (askSealCore, escrowProofCore) i tak go nie importuja; podmiana jest dla
// askStore/answerStore (test/asksStore.test.ts) i przyszlych testow tras.
//
// Nowe pliki testow dopisz do TEST_FILES.
const path = require('node:path');
const Module = require('node:module');

const TEST_FILES = ['test/asksSeals.test.ts', 'test/asksEscrowProof.test.ts', 'test/asksStore.test.ts', 'test/asksCreate.test.ts', 'test/asksPublicView.test.ts', 'test/asksReseal.test.ts', 'test/asksAcceptResolve.test.ts', 'test/asksEscrowRoutes.test.ts', 'test/asksSolanaCore.test.ts', 'test/asksSolanaStore.test.ts', 'test/asksSolanaAccept.test.ts'];

if (require.main !== module) {
  const originalLoad = Module._load;
  Module._load = function load(request, ...rest) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, ...rest);
  };
  return;
}

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
// Brakujacy plik z listy to blad, nie cichy pominiety zestaw - inaczej
// zielony wynik moglby ukrywac testy, ktore w ogole sie nie uruchomily.
const missing = TEST_FILES.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error(`Brak plikow testow: ${missing.join(', ')}`);
  process.exit(1);
}
const files = TEST_FILES;

const env = {
  ...process.env,
  NODE_OPTIONS: '--no-experimental-detect-module --no-experimental-strip-types',
  TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node' }),
  TS_NODE_TRANSPILE_ONLY: '1',
};
const mocha = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js');
const r = spawnSync(process.execPath, [mocha, '-r', __filename, '-r', 'ts-node/register', ...files], {
  stdio: 'inherit',
  env,
  cwd: root,
});
process.exit(r.status ?? 1);
