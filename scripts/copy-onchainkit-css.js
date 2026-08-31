// OnchainKit dostarcza style.css z `@layer base`, ktory Tailwind odrzuca
// ("`@layer base` is used but no matching `@tailwind base` directive"), wiec pliku
// nie da sie zaimportowac przez bundler. Kopiujemy go do public/ i linkujemy
// same-origin - to usuwa render-blokujacy request do unpkg (DNS + TLS + third party)
// bez przepuszczania CSS przez PostCSS.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@coinbase', 'onchainkit', 'dist', 'assets', 'style.css');
const destDir = path.join(__dirname, '..', 'public', 'vendor');
const dest = path.join(destDir, 'onchainkit.css');

if (!fs.existsSync(src)) {
  console.warn('[copy-onchainkit-css] pominieto: brak ' + src);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-onchainkit-css] ' + (fs.statSync(dest).size / 1024).toFixed(0) + ' KB -> public/vendor/onchainkit.css');
