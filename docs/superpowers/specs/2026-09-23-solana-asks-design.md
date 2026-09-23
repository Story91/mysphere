# Aski na Solanie - projekt (model A: placenie przy akceptacji, SOL)

Stan: projekt, niewdrozony. Budowac DOPIERO na zacommitowanej przebudowie
bezpieczenstwa Askow (askStore / askSealCore / trasy accept, create, reseal).

Decyzje wlasciciela: model A (nic nie jest zablokowane, autor placi kazda
zaakceptowana odpowiedz), token = natywny SOL, tozsamosc = sesja SIWE (EVM).

## 0. Co ksztaltuje projekt

- Stan zapieczetowany jest dzis na sztywno USDC/base: `pickState`,
  `pickAcceptance`, `pickRegistry` (askSealCore.ts) oraz `mirrorAsk`,
  `writeNewAsk` (askStore.ts), `publicAsk` (askPublicView.ts),
  `askMirrorPlan` (resealCore.ts) wymuszaja USDC/base.
- `perAnswerFor` zaokragla do centow - SOL potrzebuje wlasnej matematyki
  w lamportach od poczatku do konca.
- NAJWIEKSZE RYZYKO: zgodnosc MAC. Payload pieczeci Base musi miec dokladnie
  dzisiejsze klucze; klucz `solana` istnieje tylko gdy `network === 'solana'`.
  Najpierw zlote wektory MAC w test/asksSeals.test.ts.
- Nowe kolekcje top-level sa otwarte (catch-all) - wszystko nowe pod
  `asks/**` albo `askAnswerContent/**` (zamkniete), bez deployu regul.
- `SolanaSigner` (app/components/solana/solanaWalletTypes.ts) nie ma
  `signMessage` - trzeba przepuscic z `useWallet()` w SolanaWalletRuntime.tsx.
- ed25519 bez nowych paczek: `crypto.verify(null, msg, spkiKey, sig)`,
  SPKI = `302a300506032b6570032100` + 32 bajty klucza; base58 dekodowac bigintem.
- Resolve na Asku SOL: pomijac sciezke legacy (mirror `accepted` bez rekordu
  na Asku SOL = zawsze podrobka), inaczej `invalid_per_answer` blokuje resolve.
- Kwote i adres do zaplaty brac z serwera (GET answers), nigdy z mirrora Aska.
- scripts/test-asks-seals.cjs wymienia nieistniejacy test/asksCutoff.test.ts.

## 1. Decyzje

| Temat | Decyzja |
|---|---|
| Szyna | `token: 'SOL'`, `network: 'solana'`, tylko `funding: 'on-resolve'`; escrowed + solana -> 400 `invalid_funding` |
| Klaster | zapieczetowany w stanie przy tworzeniu; accept -> 409 `wrong_cluster`, gdy serwer ma inny |
| Kwoty | prawda = lamporty jako napisy dziesietne (`budgetLamports`, `perAnswerLamports = floor(budget/seats)`); liczby SOL tylko do wyswietlania |
| Minimum na odpowiedz | 0.005 SOL (5 000 000 lamportow) - ZATWIERDZONE przez wlasciciela 2026-09-23. 0.001 jest tuz nad minimum rent (890 880) i pierwszy przelew na puste konto by padl |
| Sufit budzetu | 1000 SOL |
| Powiazanie portfela | na poziomie profilu, jedno na konto EVM: `askAnswerContent/_registry/solanaWallets/{evmLower}` (HMAC). To samo powiazanie = platnik autora i odbiorca odpowiadajacego |
| Platnik autora | zamrozony w stanie przy tworzeniu (`state.solana.payer`) |
| Odbiorca odpowiedzi | zamrozony per odpowiedz w `asks/{askId}/payees/{answerId}` (`tx.create`, nigdy nie zmieniany) |
| Fee payer | nie musi byc autorem; wymagane: zrodlo transferu SystemProgram = `state.solana.payer` i Memo v2 z platnikiem jako kontem (Memo v2 wymaga podpisu) |
| Rejestr | `askAnswerContent/_registry/payouts/solana:<signature>` - jeden podpis placi jedna odpowiedz na zawsze, wielkosc liter zachowana |
| Commitment | `confirmed` (ryzyko opisane nizej) |
| Miniapp | Aski SOL tylko do odczytu, ukryte w pasie feedu, nie w composerze |

### Formaty

- Memo wyplaty (cale memo): `mysphere:ask|v1|<askId>|<answerId>`; oba ID przez
  `isDocId`; wiecej niz jedno memo `mysphere:ask|` -> odrzucone.
- Wiadomosc powiazania (serwer odtwarza bajt w bajt z evm, solana, nonce, issuedAtMs):
```
mysphere: link a Solana wallet to Asks

Solana wallet: <base58>
Account: <0x evm lowercase>
Use: receive SOL for accepted answers and pay SOL on your own Asks
Nonce: <32 hex>
Issued at: <ISO>
Expires at: <ISO +10 min>

This signature is free and does not move funds.
```
- Bezstanowy challenge: `v1.<kid>.<issuedAtMs>.<nonce>.<mac>`,
  mac = sealMac(key, 'asksolchallenge:v1', {evm, solana, issuedAtMs, nonce});
  TTL 10 min, 60 s luzu zegara; nowe powiazanie musi miec issuedAt wieksze niz zapisane.

## 2. Interfejsy (tor A publikuje je pierwszy)

- `app/utils/asks/solAmounts.ts` (bezpieczne w przegladarce): MIN_PER_ANSWER_LAMPORTS,
  MAX_BUDGET_LAMPORTS, parseSolToLamports (przyjmuje "0,5", max 9 miejsc, bez
  wykladnika), formatLamports, lamportsToSolNumber, perAnswerLamportsFor,
  isLamportsString, ASK_PAYOUT_MEMO_PREFIX, buildAskPayoutMemo,
  buildSolanaBindingMessage, isSolAsk.
- `app/utils/asks/solanaAskCore.ts` (node:crypto): decodeBase58,
  verifySolanaMessageSignature, mintBindingChallenge, checkBindingChallenge,
  verifySolanaAskPayout -> ok | failed-tx | no-ask-memo | ambiguous-memo |
  wrong-memo | memo-not-signed | no-transfer | wrong-sender | wrong-recipient |
  too-small | self-pay.
- askSealCore.ts: SealedSolanaTerms {cluster, payer, budgetLamports,
  perAnswerLamports}; SealedAskState z opcjonalnym `solana`; unia
  AcceptanceRecord (EVM bez zmian | SolanaAcceptanceRecord kind 'sol-transfer');
  unia PayoutRegistryEntry; SolanaWalletBinding; AnswerPayee; domeny
  'askpayee:v1', 'asksolbind:v1', 'asksolchallenge:v1'; solanaPayoutRegistryId,
  payoutRegistryIdFor, solanaTransferAcceptance, acceptancePayoutRef, railOf,
  seal/read dla binding i payee; newAskState z `rail`.
- askStore.ts: mirrorAsk(tx, store, askId, patch, state), payeeRef,
  solanaWalletRef, createSealedAsk z `rail`, recordAcceptance wg sieci rekordu.

## 3. Kroki wg torow (rozlaczne pliki)

**Tor A - rdzen i pieczecie (pierwszy):** 1) zlote wektory MAC; 2) solAmounts.ts;
3) solanaAskCore.ts (reuse readSystemTransfer, isSolanaAddress, isSolanaSignature
z replyCore.ts, MEMO_PROGRAM_ADDRESS z solanaChain.ts); 4) askSealCore: pickState
rozgalezione po network, niezmienniki SOL, unie, id rejestru `solana:`,
effectiveAsk SOL; 5) types.ts + askMapping.toAsk (per-answer z lamportow);
6) askPublicView (szyna ze stanu); 7) resealCore (railOf, bez legacy dla SOL,
`forged_on_sol_ask`); 8) test/asksSolanaCore.test.ts.

**Tor B - magazyn, powiazanie, tworzenie, odpowiedzi:** 9) askStore (payeeRef,
solanaWalletRef, mirror SOL bez publikowania adresu platnika); 10)
app/api/asks/solanaWalletStore.ts (readBinding, writeBinding, readPayees,
freezePayeeFromBinding -> `payee_is_author_wallet`); 11) trasa
app/api/asks/solana-wallet (GET challenge, POST podpis; kody session_required,
invalid_address, invalid_signature, challenge_invalid, challenge_expired,
solana_signature_invalid, binding_outdated, store_unavailable, seal_invalid);
12) app/api/asks/[id]/payee (POST {answerId}: wrong_rail, ask_resolved,
solana_wallet_required, payee_locked); 13) draft.ts validateSolAskDraft;
14) create/route.ts galaz `network: 'solana'` (x402 zostaje USDC); 15)
answerStore.saveAnswer zamraza odbiorce w tej samej transakcji, zwraca
payoutAddressBound; 16) GET answers: `rail`, `solanaPayer` dla autora,
payoutAddress tylko dla autora i odpowiadajacego; 17) testy na falszywym Firestore.

**Tor C - trasy pieniedzy:** 18) app/api/asks/solanaAccept.ts
`acceptSolanaAnswer(store, {askId, answerId, signature, viewer}, {fetchTx})`:
wrong_rail, not_ask_author, invalid_payee, already_accepted, ask_resolved,
wrong_cluster, payee_unbound, payout_unverified (retryable), chain_unavailable,
mapowanie powodow weryfikacji na payout_*, payout_time_unknown,
payout_predates_answer, w transakcji: rejestr (payout_already_used),
no_seats_left, recordAcceptance, auto-full, mirrorAsk; notyfikacja; 19)
accept/route.ts rozgalezia po `payoutSignature`; 20) resolve bez legacy dla SOL;
21) call-site'y mirrorAsk w escrow-*, resealEngine; 22) testy z wstrzyknietym fetchTx.

**Tor D - klient:** 23) signMessage w SolanaSigner i SolanaWalletRuntime; 24)
app/utils/asks/useSolanaAskWallet.ts (bez @solana/*); 25)
app/utils/asks/solanaAskPay.ts - JEDYNY plik klienta z web3.js, przez
`await import()`: Memo v2 + SystemProgram.transfer, confirmOrAskChain; 26)
useCreateAsk: `rail: 'usdc-base' | 'sol-solana'`; 27) AskComposer: wybor
"USDC on Base / SOL on Solana", budzet w SOL, tekst "Paid on accept in SOL.
Nothing is locked."; 28) AskCard/AskRailRow/FeedAskRail/AskClaimPanel;
29) FeedAnswerForm: "Link a Solana wallet to get paid"; 30) AsksContent: platnosc
SOL z danymi z GET answers, wymog portfela = solanaPayer, zachowanie podpisu
przed POST accept, linki do eksploratora wg sieci; 31) strona /ask/[id]
i MoneyContent; 32) testy UI + straznik bundla (brak statycznego `from '@solana/`).

Kolejnosc: A1 -> A2-5 -> B, C, D rownolegle (C po B).

## 4. Leniwosc i wielkosc liter

Zadnego statycznego `@solana/*` w komponentach Askow. Adresy i podpisy Solany
nigdy przez lowerAddress / normalizeAddress / lowerTxHash / toLowerCase.

## 5. Reguly Firestore

Bez zmian: `asks/{id}/payees/*`, `askAnswerContent/_registry/solanaWallets/*`,
`askAnswerContent/_registry/payouts/solana:*` sa zamkniete przez hasOwnRules.

## 6. Dla wlasciciela

1. Minimum na odpowiedz (proponowane 0.005 SOL) i sufit budzetu.
2. Wlasny RPC Solany na produkcji (Helius / QuickNode) - akceptacja czyta lancuch za kazdym razem.
3. Polityka odbiorcy: niezmienny per odpowiedz; zmiana portfela dziala tylko na przyszle odpowiedzi.
4. Odpowiadanie na Ask SOL bez powiazanego portfela: serwer pozwala, UI mocno zacheca, wyplata zablokowana do powiazania.
5. Test na devnecie z Phantomem i Solflare.

## 7. Ryzyka

Zgodnosc MAC; commitment `confirmed` (opcja: `finalized` dla accept);
portfele wielopodpisowe i TransferWithSeed nierozpoznawane; portfele bez
signMessage nie powiaza adresu; spoofowanie mirrora (decyzje tylko ze stanu);
self-dealing (`payee_is_author_wallet`, `self-pay`); rent przy malych kwotach;
prywatnosc (adres widzi autor, po wyplacie publiczny na lancuchu); limity publicznego RPC.
