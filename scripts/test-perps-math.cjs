// Uruchamia test czystej matematyki perps (test/derivativesMath.test.ts).
//
// Dlaczego osobny runner: `npx hardhat test` na Node 24 laduje pliki .ts z
// app/ przez natywny loader ESM, ktory wymaga rozszerzen w importach i
// wywala sie na `import ... from '../format'`. ts-node w trybie CommonJS
// radzi sobie bez zmian w kodzie aplikacji. Cudzyslowy w JSON nie przezywaja
// skryptu npm na Windowsie, dlatego zmienne srodowiskowe ustawia ten plik.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const env = {
  ...process.env,
  NODE_OPTIONS: '--no-experimental-detect-module --no-experimental-strip-types',
  TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node' }),
  TS_NODE_TRANSPILE_ONLY: '1',
};
const mocha = path.join(__dirname, '..', 'node_modules', 'mocha', 'bin', 'mocha.js');
const r = spawnSync(process.execPath, [mocha, '-r', 'ts-node/register', 'test/derivativesMath.test.ts'], {
  stdio: 'inherit',
  env,
});
process.exit(r.status ?? 1);
