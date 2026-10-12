# Start tylko dla ludzi (Coinbase Verification) - rozpoznanie i projekt

Stan: 2026-10-12, przed implementacja. Pomysl nr 2 z listy "unikalny launchpad".

## Co sprawdzone na lancuchu (Base mainnet)

- Indexer Coinbase Verifications: `0x2c7eE1E5f416dfF40054c27A62f7B357C4E8619C` - ma kod (proxy, 209 B),
  `getAttestationUid(address recipient, bytes32 schemaUid) view returns (bytes32)` odpowiada.
- EAS (predeploy OP Stack): `0x4200000000000000000000000000000000000021`, `getAttestation(uid)`.
- Schemat "Coinbase Verified Account" (`bool verifiedAccount`):
  `0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9` (docs CDP i OnchainKit).
- Portfele wlasciciela `0xD4885A5a...030e` i `0x83C68Dbf...1E83` NIE maja atestacji (uid = 0).

Niesprawdzone: adres atestatora Coinbase (zadne oficjalne zrodlo w wynikach; base.easscan.org mial
przerwe techniczna, Infura wyczerpala limit getLogs) i liczba aktywnych atestacji (jedyna liczba
"20 mln" pochodzi z bloga strony trzeciej, bez zrodla). Przed wdrozeniem: odczytac atestatora z
dowolnej prawdziwej atestacji i wpisac go jako immutable.

## Projekt (v3 launchpada, nowe wdrozenie - stare tokeny bez zmian)

1. **Opt-in na token.** Tworca w trybie Creator wlacza "Human launch" i wybiera okno (np. 5 min,
   sufit 15 min). Bez tego token startuje jak dzis - mala liczba zweryfikowanych portfeli nie moze
   blokowac wszystkich startow.
2. **W oknie kupuje tylko odbiorca z atestacja.** `_buy` sprawdza `recipient` (takze przez zap i
   `buyFor`): uid z indexera != 0, a w EAS: schemat zgodny, `attester == COINBASE_ATTESTER`,
   `revocationTime == 0`, `expirationTime == 0 || > now`, `recipient` zgodny. Istniejacy limit okna
   na adres (`windowCap`) dziala dalej - razem daja "jeden czlowiek, jeden limit".
3. **Pre-buy tworcy zwolniony** - idzie w tej samej transakcji co start, po tej samej krzywej.
4. **Sprzedaz bez ograniczen** (nikt nie moze zostac uwieziony).
5. Plakietka "Human launch ✓" na tablicy i stronie tokena, odliczanie okna.

Malejaca oplata anty-snajperska po oknie wymaga hooka z `beforeSwap` i dynamic fee - osobny etap.

## Ryzyka

- Wielu traderow nie ma atestacji (wlasciciel tez nie) albo uzywa Smart Wallet, ktorego adres nie
  jest atestowany - stad opt-in i krotkie okno.
- Indexer to proxy Coinbase: zmiana implementacji moze zmienic odpowiedzi. Kontrakt weryfikuje
  atestacje w EAS sam, indexer sluzy tylko do znalezienia uid.
- Weryfikacja Coinbase to KYC: "Human launch" filtruje boty, nie sybile z wieloma kontami Coinbase
  (te sa rzadkie i drogie).
