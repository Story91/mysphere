// Uruchamia testy czystej logiki portfela Solany w nawigacji
// (test/solanaWalletNav.test.ts): parowanie portfela EVM z kontem Solany,
// tryb sieci w localStorage i decyzje przelacznika sieci.
//
// Ten sam runner co scripts/test-solana.cjs i z tego samego powodu:
// `npx hardhat test` na Node 24 laduje .ts z app/ natywnym loaderem ESM, ktory
// wymaga rozszerzen w importach. ts-node w trybie CommonJS radzi sobie bez
// zmian w kodzie aplikacji.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const env = {
  ...process.env,
  NODE_OPTIONS: '--no-experimental-detect-module --no-experimental-strip-types',
  TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node' }),
  TS_NODE_TRANSPILE_ONLY: '1',
};
const mocha = path.join(__dirname, '..', 'node_modules', 'mocha', 'bin', 'mocha.js');
const r = spawnSync(process.execPath, [mocha, '-r', 'ts-node/register', 'test/solanaWalletNav.test.ts'], {
  stdio: 'inherit',
  env,
});
process.exit(r.status ?? 1);
