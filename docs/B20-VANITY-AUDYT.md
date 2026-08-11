# Audyt: vanity adresy B20 na Startpadzie (krok 1)

> Pytanie: czy PRZEWIDYWALNY adres tokena B20 (potrzebny do "kopania" ładnych
> adresów) otwiera napastnikowi możliwość ZATRUCIA puli przed graduacją? Od tego
> zależy, czy vanity da się dodać bezpiecznie.
>
> **Odpowiedź: NIE. Vanity można dodać bezpiecznie.** Dowód: audyt kodu +
> symulacja na forku Base mainnet (`scripts/launchpad/vanityAuditProbe.ts`).

## Dlaczego adres jest dziś nieprzewidywalny

`CurveLaunchpad._launch` liczy `launchId` z `blockhash(block.number - 1)`
(`CurveLaunchpad.sol:849-857`), a token powstaje z soli wyprowadzonej z tego
`launchId`. Blockhash jest losowy do chwili wykopania bloku, więc adresu nie da
się przewidzieć — a więc nie da się go wykopać pod vanity. To była świadoma
decyzja "anty-front-run".

## Co NAPRAWDĘ chroni pulę

Nie `blockhash`, tylko **bramka hooka**. `B20LaunchHook.beforeInitialize`
(`B20LaunchHook.sol:378-396`):

```solidity
function beforeInitialize(address sender, PoolKey calldata key, uint160) external onlyPoolManager returns (bytes4) {
    if (sender != VAULT) revert NotVault();   // pulę z tym hookiem otwiera WYŁĄCZNIE vault
```

Pula z naszym hookiem w kluczu może powstać **tylko** przez vault — niezależnie
od tego, czy adres tokena jest znany. Uniswap v4 wywołuje `beforeInitialize`
przy każdej inicjalizacji puli z tym hookiem, a hook rewertuje każdego, kto nie
jest vaultem.

Dodatkowo adres jest związany z twórcą: `B20TokenFactory._effectiveSalt =
keccak256(deployer, salt)`, więc obcy nie odtworzy cudzego adresu (inny
`msg.sender` = inny adres). Grief "zajmę Twój adres" jest zamknięty bez
blockhasha.

## Symulacja na forku Base mainnet (prawdziwy PoolManager v4)

`npx hardhat run scripts/launchpad/vanityAuditProbe.ts` — blok ~49.8M:

| Test | Wynik |
| --- | --- |
| Token wystartował, adres ZNANY (scenariusz vanity) | `0x0eb1…9a3c` |
| **ATAK 1:** obcy `initialize` NASZEJ puli (z hookiem) | **REWERT** (`NotVault`) |
| **ATAK 2:** obcy tworzy junk-pulę BEZ hooka (`hooks=0`) | powstaje — ale to INNY `PoolKey`, osobna pula |
| Graduacja NASZEJ puli mimo junk-puli | **działa**, `state=Graduated` |

## Wniosek

- Przewidywalny adres **nie** otwiera zatrucia: bramka hooka blokuje obcą
  inicjalizację naszej puli, a junk-pula bez hooka nie koliduje z graduacją
  (inny `PoolKey`) i jest możliwa dla każdego tokena po starcie tak czy inaczej.
- `blockhash` w salcie jest **obroną-w-głąb**, nie jedyną obroną. Można go zdjąć
  na rzecz soli od użytkownika (`launchId = keccak(creator, userSalt)`), żeby
  adres stał się przewidywalny i minowalny — bez otwierania nowego wektora.

## Krok 2 (do zrobienia, gdy zapadnie decyzja)

1. Nowy launchpad: `launch()` przyjmuje `userSalt`, `launchId` bez blockhasha.
2. Adaptacja kopalni klienta (`app/utils/b20/addressing.ts`) do podwójnego
   keccaka launchpada (sender = `B20TokenFactory`, sól = `keccak(launchpad, launchId)`).
3. Ograniczenia znaków bez zmian — ogon adresu to hex, `HEX_SUBSTITUTES` już są
   (`s→5`, `o→0`, `l→1`…), tak jak na `/b20/create`.
