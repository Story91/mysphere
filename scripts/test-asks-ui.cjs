// Uruchamia testy czystej logiki UI Askow (test/askRailRow.test.ts): linia
// meta rozstrzygnietego Aska w prawym railu i wspolny format "3h ago".
//
// Ten sam runner co scripts/test-solana.cjs i z tego samego powodu: ts-node
// w trybie CommonJS laduje .ts z app/ bez zmian w kodzie aplikacji. Roznica
// jest jedna - testowane pliki to .tsx, wiec kompilator dostaje `jsx`
// (w tsconfig stoi "preserve" dla Next, a Node surowego JSX nie przeczyta).
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const env = {
  ...process.env,
  NODE_OPTIONS: '--no-experimental-detect-module --no-experimental-strip-types',
  TS_NODE_COMPILER_OPTIONS: JSON.stringify({
    module: 'commonjs',
    moduleResolution: 'node',
    jsx: 'react-jsx',
  }),
  TS_NODE_TRANSPILE_ONLY: '1',
};
const mocha = path.join(__dirname, '..', 'node_modules', 'mocha', 'bin', 'mocha.js');
const r = spawnSync(
  process.execPath,
  [mocha, '-r', 'ts-node/register', '--extension', 'ts', '--extension', 'tsx', 'test/askRailRow.test.ts'],
  { stdio: 'inherit', env }
);
process.exit(r.status ?? 1);
