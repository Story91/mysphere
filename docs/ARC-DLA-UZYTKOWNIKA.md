# Arc — jak zacząć (dla użytkownika)

Startpad działa na Arc mainnet od 16 września 2026. Arc jest inny niż Base
w jednej rzeczy, która myli wszystkich na starcie — i od niej zaczynamy.

---

## Najważniejsze: na Arc USDC to moneta, nie token

Na Base masz ETH na gaz i USDC jako osobny token. **Na Arc USDC jest walutą
sieci** — tym samym, czym ETH na Ethereum. Płacisz nim gaz, kupujesz nim tokeny,
i ma **18 miejsc po przecinku**, tak jak ETH.

Wynikają z tego dwie rzeczy:

- **Nie importuj USDC przez „Add token".** Zobaczysz je od razu jako saldo
  główne portfela, bez żadnego importu.
- Adres `0x3600000000000000000000000000000000000000` istnieje i działa, ale to
  tylko nakładka ERC-20 na to samo saldo, liczona w 6 miejscach. Dodanie go jako
  tokenu pokaże **to samo saldo drugi raz**, a przy złych decimals — liczbę
  różniącą się o milion.

---

## Dodanie sieci do MetaMaska

MetaMask → Ustawienia → Sieci → **Dodaj sieć ręcznie**:

| pole | wartość |
|---|---|
| Nazwa sieci | `Arc` |
| Nowy adres URL sieci RPC | `https://rpc.mainnet.arc.io` |
| Identyfikator łańcucha | `5042` |
| Symbol waluty | `USDC` |
| Adres URL eksploratora bloków | `https://arc-scan.org` |

**Jeśli sieć już masz, nie dodawaj drugiej — podmień w niej RPC.** Dwie sieci
o tym samym `chainId` robią w MetaMasku bałagan.

### „Dodałem sieć i widzę 0 USDC"

Prawie zawsze to RPC. Do 16.09 jedynym działającym endpointem był
`rpc.arc-scan.org`, który **oddaje 503 co drugie zapytanie** — MetaMask nie może
wtedy odczytać salda i pokazuje zero. Oficjalny endpoint Circle
(`rpc.mainnet.arc.io`) ruszył dopiero w dniu startu.

Kolejność sprawdzania:

1. Czy w sieci wpisany jest `https://rpc.mainnet.arc.io`.
2. Czy MetaMask stoi na **tym koncie**, na którym masz środki — saldo jest
   przypisane do adresu, nie do portfela.
3. Czy `chainId` to dokładnie `5042` (nie `5042002` — to testnet).
4. Podgląd bez portfela: `https://arc-scan.org/address/TWÓJ_ADRES`.

---

## Skąd wziąć USDC na Arc

Potrzebujesz USDC na Arc **zanim** cokolwiek zrobisz — także na gaz. Sam
przelew z Base nie wystarczy, jeśli robisz go „na surowo": most CCTP wymaga
odebrania przesyłki po stronie Arc, a bez gazu nie masz czym za to odbieranie
zapłacić. Klasyczne jajko i kura.

**Na pierwszy raz użyj mostu z własnym dostarczycielem** — np. Jumper
(`jumper.exchange`), trasa na Arc. Taki most sam dowozi środki na miejsce, bez
Twojego gazu, w około 20 minut. Dopiero **mając już gaz na Arc** możesz używać
tańszych, bezpośrednich przelewów.

Koszty na Arc są znikome: launch tokena to ~0,018 USDC, zakup na krzywej
~0,003 USDC, graduacja ~0,009 USDC.

---

## Czego się spodziewać na Startpadzie

- **Kwoty są w USDC, nie w ETH.** Token graduuje przy **5 000 USDC** zebranych
  na krzywej; kapitalizacja startowa to 1 250 USDC, po graduacji 31 250 USDC.
- **Wiersze z plakietką SAMPLE to atrapy.** Znikają po pierwszym prawdziwym
  launchu i nie da się nimi handlować. Liczby w nagłówku („Curve reserve",
  „Active curves") **nigdy** ich nie liczą.
- **Board potrzebuje kilkunastu sekund**, żeby odtworzyć rynek. Arc robi ~169
  tysięcy bloków na dobę, więc odczyt historii to sporo zapytań.
- **Handel po graduacji** działa przez pulę Uniswap v4.

### Uwaga przy sprzedaży po graduacji

Przy **sprzedaży** tokena z puli portfel poprosi o zgodę dla kontraktu, który
wykonuje wymianę. Na Arc ten kontrakt **nie jest potwierdzony przez Uniswapa** —
Uniswap nie listuje Arc — więc Startpad prosi o zgodę **tylko na kwotę tej
jednej sprzedaży**, a nie bez limitu, jak robi to na Base. Dlatego każda
sprzedaż na Arc wymaga osobnego zatwierdzenia. To celowe: jeśli coś pójdzie nie
tak, ryzykujesz tym, co właśnie sprzedajesz, a nie całym saldem tokena.

Kupno takiej zgody nie wymaga — idzie bezpośrednio wartością transakcji.

---

## Adresy

| co | adres |
|---|---|
| Launchpad | `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340` |
| USDC (nakładka ERC-20, **nie importuj**) | `0x3600000000000000000000000000000000000000` |
| Eksplorator | `https://arc-scan.org` |

Stan techniczny sieci, ryzyka i to, czego jeszcze nie wiemy:
[`ARC-STATUS-2026-09-16.md`](ARC-STATUS-2026-09-16.md).
