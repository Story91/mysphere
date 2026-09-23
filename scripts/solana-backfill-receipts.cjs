/**
 * JEDNORAZOWA MIGRACJA: wpisy w rejestrze kwitow dla postow z Solany zapisanych
 * przez przegladarke PRZED memo v2 (23.09.2026).
 *
 * =====================================================================
 *  ZAPISUJE DO PRODUKCYJNEJ BAZY (tylko z --apply). Uruchamia WLASCICIEL.
 * =====================================================================
 *
 *   node scripts/solana-backfill-receipts.cjs            # SUCHY BIEG, tylko raport
 *   node scripts/solana-backfill-receipts.cjs --apply    # faktyczny zapis
 *
 * === PO CO ===
 * Od 23.09.2026 post z Solany zapisuje serwer i od razu tworzy wpis w rejestrze
 * (app/utils/solana/receiptRegistry.ts). Posty sprzed tej zmiany wpisu nie maja,
 * wiec napiwki, platne odpowiedzi i odznaka Proof of Bags sa pod nimi wylaczone.
 * Zadna trasa ich juz "leniwie" nie zarejestruje - wlasnie ta sciezka byla
 * dziura (skasuj post, zaloz od nowa z wlasna transakcja, przejmij napiwki).
 *
 * Skrypt rejestruje tylko posty z `createTime` PRZED granica
 * LEGACY_POST_CUTOFF_MS. Post skasowany i zalozony od nowa dostaje nowy
 * `createTime`, wiec migracji juz nie podlega.
 *
 * === ZANIM URUCHOMISZ Z --apply ===
 *  1. Wdroz nowe reguly Firestore (firebase deploy --only firestore:rules)
 *     i sprawdz: node scripts/checkRulesEffect.mjs -> solanaPostReceipts: denied.
 *  2. Uruchom z TYMI SAMYMI zmiennymi co produkcja:
 *     - NEXT_PUBLIC_SOLANA_CLUSTER / NEXT_PUBLIC_SOLANA_RPC_URL - klaster, na
 *       ktorym stoja posty (wpis pamieta klaster i na innym nie zadziala),
 *     - GOOGLE_CREDENTIALS (i SOLANA_RECEIPT_SECRET, jesli produkcja go ma) -
 *       od nich zalezy klucz HMAC. Skrypt wypisuje `kid`; musi byc taki sam
 *       jak w wpisach, ktore produkcja tworzy sama.
 *     Domyslnie skrypt czyta .env.local.
 */
const path = require('node:path');
const Module = require('node:module');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// 'server-only' rzuca poza bundlem Nexta - tu jestesmy po stronie serwera
// z definicji, wiec zastepujemy go pustym modulem.
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, ...rest);
};

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'commonjs', moduleResolution: 'node' });
process.env.TS_NODE_TRANSPILE_ONLY = '1';
require('ts-node/register');

const { Connection } = require('@solana/web3.js');
const { getAdminDb } = require('../app/utils/auth/firebaseAdmin');
const { registerLegacyReceipt, registryKeyId, LEGACY_POST_CUTOFF_MS } = require('../app/utils/solana/receiptRegistry');
const { SOLANA_CLUSTER, SOLANA_RPC_URL } = require('../app/basechat/Solana/config/solanaChain');

const apply = process.argv.includes('--apply');

(async () => {
  const db = await getAdminDb();
  if (!db) {
    console.error('Brak Firebase Admin (GOOGLE_CREDENTIALS) - nic do zrobienia.');
    process.exit(1);
  }
  console.log(`Tryb: ${apply ? 'ZAPIS (--apply)' : 'suchy bieg'}`);
  console.log(`Klaster: ${SOLANA_CLUSTER}  RPC: ${SOLANA_RPC_URL}`);
  console.log(`Granica createTime: ${new Date(LEGACY_POST_CUTOFF_MS).toISOString()}`);
  console.log(`Klucz HMAC (kid): ${registryKeyId() || 'BRAK - wpisow nie da sie podpisac'}`);

  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const snap = await db.collection('posts').where('network', '==', 'solana').get();
  console.log(`Postow z Solany: ${snap.size}\n`);

  const tally = {};
  for (const doc of snap.docs) {
    let result;
    try {
      result = await registerLegacyReceipt(db, connection, doc.id, apply);
    } catch (error) {
      result = { outcome: `blad: ${error && error.message ? error.message : error}` };
    }
    tally[result.outcome] = (tally[result.outcome] || 0) + 1;
    console.log(`${doc.id}  ${result.outcome}${result.signer ? `  ${result.signer}` : ''}`);
  }

  console.log('\nPodsumowanie:', tally);
  if (!apply) console.log('To byl suchy bieg. Zapis: dodaj --apply.');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
