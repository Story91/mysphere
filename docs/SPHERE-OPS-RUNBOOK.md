# SPHERE - runbook operacyjny (kto, co, na ktorym kontrakcie)

Stan na 2026-09-02, po launchu (1.09), graduacji (1.09 22:48 UTC),
pierwszym auto-burnie i wdrozeniu fazy 1B. Jedna zasada porzadkuje
wszystko: **keeper robi to, co bezuprawnieniowe; Safe robi to, co jest
polityka; nikt nie robi nic wiecej, bo kontrakty nie maja adminow.**

---

## 1. Mapa kontraktow (Base mainnet)

| Kontrakt | Adres | Kto wola | Co sie tam dzieje |
| --- | --- | --- | --- |
| SPHERE (token B20) | `0xB200000000000000000000BA5eDb84c678432476` | - | 1B stale, bez adminow |
| CurveLaunchpad | `0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D` | keeper | krzywa zamknieta; zostaly `claimFor` (fee z krzywej) |
| B20LaunchHook | `0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044` | keeper | `settle` (podzial fee hooka), `executeBuyback` (**auto-burn**), `claimEthFor` / `claimTokenFor` |
| LiquidityVault | `0x6108aDCb176D2A4A6283A06bb0Dd468b86A6AB63` | keeper | `harvest` (fee LP), `claimEthFor` / `claimTokenFor`; pozycja LP zamknieta na zawsze |
| SphereCreatorEscrow | `0xe984986f4F1E067f697b548D5fe942813d03Da37` | keeper | `release()` ETH 50/50 -> Safe (pot/ops), `releaseToken()` SPHERE -> vesting |
| SphereRewards | `0x9030e53E7AC1bc81Cf28b196BA336E5544ce4A47` | **Safe** | 42% fee z krzywej; `pull(to, amount)` tylko CONSUMER=Safe |
| SphereTokenVesting | `0xB5dE95224F2bEDee2e7Ca7170F5B6a02641255AD` | keeper | 61.9M + tokenowe fee escrow; klif do **7.10.2026**, potem liniowo do 7.09.2027; `release` -> Safe |
| SphereBuyback (1B) | `0x98e51f42245Bf9A0b1e0005510aEE82C52bE8A7b` | **Safe** zasila, keeper `checkpoint`, ktokolwiek `execute` | skup uznaniowy: 20% na dEaD, 80% do dystrybutora |
| SphereStreamingMerkleDistributor (1B) | `0xc0b018161bB48383c808Aa47923f5501758D3E9D` | PROPOSER=deployer, GUARDIAN=Safe, keeper `activate` | nagrody tworcow; pierwszy root DOPIERO po 4 epokach shadow |
| Safe (1/1) | `0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F` | wlasciciel | przychod protokolu, wszystkie role polityki |
| Deployer / keeper EOA | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` | wlasciciel | LAUNCH_AUTHORITY, PROPOSER, CHECKPOINTER; klucz w `.env.local` |

---

## 2. Dwa rozne "burny" - nie mylic w komunikacji

**A. Auto-burn (hook) - enforced by contract.** 50% nogi ETH tworcy z kazdej
oplaty hooka (1% swapu) trafia do `pendingBuybackEth`. `executeBuyback`
kupuje za to SPHERE w puli i wysyla tokeny na 0xdEaD. Kazdy moze zawolac.
Hook ma limit ruchu ceny w jednej transakcji, wiec wydaje tylko czesc
kolejki i reszte zostawia na nastepny przebieg (1. burn: 0.035 ETH z 0.1827
w kolejce). Nikt nie decyduje o kwocie. **ETH nie jest palone** - jest
wydawane na tokeny; palone sa tokeny.

**B. Skup skarbca (SphereBuyback, 1B) - team-run, uznaniowy.** Safe wysyla
ETH transzami (polityka: do 50% przychodu, kanarek 10% -> 25% -> 50% ->
100%). Keeper robi `checkpoint()` (referencja ceny, maks. 1h), ktokolwiek
`execute(<=0.05 ETH)`; straznik odrzuca, jesli kurs odbiega > 4% od
checkpointu; budzet 0.5 ETH / 7 dni. Z kupionego: 20% dEaD, 80% do
dystrybutora = pula nagrod tworcow. W komunikacji ZAWSZE "discretionary".

---

## 3. Co robi keeper (automatycznie, co godzine)

`scripts/sphere/keeper.ps1` -> `npm run sphere:keeper` z kompletem adresow.
Kazdy krok pomijany, gdy nie ma nic do zrobienia; kazdy jest
bezuprawnieniowy poza `checkpoint()` (CHECKPOINTER = ten klucz).

1. `hook.settle(SPHERE)` - dzieli naliczone fee hooka (ETH i SPHERE).
2. `vault.harvest(SPHERE)` - zbiera fee LP.
3. `hook.executeBuyback(SPHERE)` - **auto-burn**, tyle ile pula zniesie.
4. Dostawy: `claimFor` / `claimEthFor` / `claimTokenFor` na Safe, Rewards,
   Escrow - ETH **i tokeny**.
5. `escrow.release()` - ETH escrow 50/50 na Safe; `escrow.releaseToken()` -
   SPHERE escrow do vestingu.
6. `vesting.release(SPHERE)` - po klifie (od 7.10) odblokowane tokeny na Safe.
7. `SphereBuyback`: `checkpoint()` gdy nieswiezy, `execute(0.05 ETH)` gdy
   kontrakt ma ETH i checkpoint jest swiezy.
8. `distributor.activate()` - gdy jest zaproponowany root po 24h weta.

Instalacja harmonogramu (raz, w PowerShellu, z katalogu repo):

```powershell
schtasks /Create /TN "SPHERE keeper" /SC HOURLY /TR "powershell -ExecutionPolicy Bypass -File \"$PWD\scripts\sphere\keeper.ps1\"" /F
```

Po instalacji USTAWIENIA ZASILANIA (raz, dla obu zadan). Domyslnie Windows
nie startuje zadania na baterii, zabija je po odlaczeniu ladowarki i nie
nadrabia pominietych startow - tak keeper zamilkl na 36 h (4-5.09.2026)
bez zadnego bledu w logu:

```powershell
foreach ($t in @("SPHERE keeper","SPHERE epoch")) {
  $s = (Get-ScheduledTask -TaskName $t).Settings
  $s.DisallowStartIfOnBatteries = $false; $s.StopIfGoingOnBatteries = $false
  $s.StartWhenAvailable = $true; $s.WakeToRun = $true
  Set-ScheduledTask -TaskName $t -Settings $s | Out-Null
}
```

Kontrola: `schtasks /Query /TN "SPHERE keeper" /FO LIST /V` - "Last Run
Time" nie starsze niz godzina, "Last Result" 0. Zamkniety laptop w trybie
Standby (S0) budzi sie do zadania; hibernacja NIE - wtedy keeper nadrobi
przy najblizszym wybudzeniu (StartWhenAvailable), a kolejka burna po
prostu poczeka (nic nie przepada, hook trzyma ETH do nastepnego wywolania).

Log: `scripts/output/keeper.log`. Po kazdym auto-burnie keeper drukuje
REALNE kwoty z eventu `AutoBuyback` (wydane ETH, spalone tokeny, hash,
reszta kolejki) - te liczby ida do postow, nic innego.

Gaz: keeper EOA potrzebuje ~0.01 ETH na tydzien przy tym wolumenie
(kazdy przebieg to kilkanascie transakcji po ~0.00002 ETH). Doladowac,
gdy spadnie ponizej 0.005.

---

## 4. Co robi TYLKO Safe (decyzje, nie automat)

| Decyzja | Jak | Kiedy |
| --- | --- | --- |
| Zasilic SphereBuyback transza | Safe -> `0x98e5...8A7b` zwykly przelew ETH | wg polityki 50% przychodu; start: kanarek ~0.05-0.1 ETH |
| Pobrac ETH z SphereRewards do skupu | `SphereRewards.pull(0x98e5...8A7b, amount)` z Safe | to jest zaprojektowana droga: fee -> skup -> 80% do puli nagrod |
| Zawetowac root dystrybutora | `distributor.veto()` z Safe w 24h | tylko gdy manifest sie nie zgadza |
| Anulowac niewydane ETH skupu | `SphereBuyback.cancel(amount)` z Safe | awaryjnie |
| Wydac ETH z Safe (ops) | zwykla transakcja Safe | wg uznania, publicznie |

Nic z tej tabeli nie jest gwarancja dla holderow i tak jest opisywane.

---

## 5. Rytm tygodnia

- **Codziennie (automat):** keeper co godzine; przeglad `keeper.log`
  (czy sa rewerty), saldo gazu keepera.
- **Sroda (start epoki):** `npm run sphere:epoch` (publishEpoch) -
  manifest poprzedniej epoki shadow; post z liczbami.
- **Tydzien:** decyzja o transzy do SphereBuyback (jesli Safe ma
  przychod); post "receipts": ETH fee -> SPHERE spalone (z eventow).
- **Po 4 czystych epokach shadow (najwczesniej ~30.09):** kalibracja wag,
  pierwszy prawdziwy root (`distributor.propose`), 24h weta, `activate`,
  claim dla tworcow w apce.
- **7.10.2026:** koniec klifu vestingu - keeper zacznie zwalniac ~5.1M
  SPHERE/mies. na Safe; komunikat wczesniej, nie po.

---

## 6. Czego NIE robic

- Nie palic ETH ani nie wysylac tokenow na dEaD recznie - burn ma byc
  z mechanizmu, z eventem, albo go nie ma.
- Nie sprzedawac SPHERE z vestingu ani z Safe bez ogloszenia z wyprzedzeniem
  (post 17.09 mowi "every wei traceable" - to zobowiazanie).
- Nie proponowac roota przed zamknieciem shadow (doktryna 27.09).
- Nie przepisywac kwot z logu "w kolejce" do postow - tylko z eventow.
- Nie dodawac nowych rol, kluczy ani "botow weryfikacyjnych" na TG.
