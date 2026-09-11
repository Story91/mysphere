// Uruchamia test/SpotifyLink.test.ts (utwor z wklejonego linku Spotify).
// Ten sam powod i ten sam sposob, co scripts/test-perps-math.cjs: hardhat na
// Node 24 laduje .ts z app/ natywnym loaderem ESM, ts-node w trybie CommonJS
// radzi sobie bez zmian w kodzie aplikacji.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const env = {
  ...process.env,
  NODE_OPTIONS: '--no-experimental-detect-module --no-experimental-strip-types',
  TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node' }),
  TS_NODE_TRANSPILE_ONLY: '1',
};
const mocha = path.join(__dirname, '..', 'node_modules', 'mocha', 'bin', 'mocha.js');
const r = spawnSync(process.execPath, [mocha, '-r', 'ts-node/register', 'test/SpotifyLink.test.ts', 'test/SpotifyComposerState.test.ts'], {
  stdio: 'inherit',
  env,
});
process.exit(r.status ?? 1);
