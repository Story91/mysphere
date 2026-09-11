/**
 * Wysyla manifest epoki i latest.json na Vercel Blob.
 *
 * Interfejs Claim (SphereRewardsClaim.tsx) czyta manifest NAJPIERW z Bloba,
 * a dopiero potem z public/ w repo. Po recznej zmianie roota trzeba wiec
 * odswiezyc Bloba, inaczej tworcy dostaja stare dowody Merkle, ktore do
 * nowego roota nie pasuja - i nie odbiora nawet tego, co im sie nalezy.
 *
 * Automat epoki (publishEpoch.ts) robi to sam; ten skrypt jest do przebiegow
 * recznych, ktore omijaja automat.
 *
 * Uruchomienie Z KATALOGU REPO:
 *   node scripts/sphere/pushManifest.cjs
 */
const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const PUB = path.join(REPO, 'public', 'sphere-epochs');

const env = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8');
const pick = (n) => (env.match(new RegExp(`^${n}=["']?([^"'\r\n]+)`, 'm')) || [])[1];
const token = (process.env.BLOB_READ_WRITE_TOKEN || pick('BLOB_READ_WRITE_TOKEN') || '').trim();

(async () => {
  if (!token) throw new Error('brak BLOB_READ_WRITE_TOKEN w env ani w .env.local');
  const { put } = require('@vercel/blob');

  const latest = JSON.parse(fs.readFileSync(path.join(PUB, 'latest.json'), 'utf8'));
  const names = [`epoch-${latest.epoch}.json`, 'latest.json'];

  for (const name of names) {
    const body = fs.readFileSync(path.join(PUB, name), 'utf8');
    const res = await put(`sphere-epochs/${name}`, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
      token,
    });
    console.log(`${name.padEnd(14)} -> ${res.url}`);
  }

  console.log('\nlatest.json wskazuje: epoka', latest.epoch, '| root', latest.root);
  console.log('onchainEpochId:', latest.onchainEpochId, '| manifestHash:', latest.manifestHash);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
