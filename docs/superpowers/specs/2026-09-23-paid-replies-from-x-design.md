# Płatne odpowiedzi z X — spec

Data: 2026-09-23. Zatwierdzone przez właściciela: płatne, minimum 0.001 SOL,
tylko pod postami z Solany.

## Teza

Odpowiedź na post MySphere prosto z X — i odpowiedź, która kosztuje. Treść
i napiwek dla autora idą w jednej transakcji, więc spam kosztuje, a autor
zarabia na każdej rozmowie pod swoim postem. „A like is worth $0.00. A payment
is not." dotyczy od teraz także odpowiedzi.

Tylko pod postami z Solany, bo tylko tam znamy portfel autora — ze
zweryfikowanego kwitu posta (`app/utils/solana/postReceipt.ts`).

## Przepływ

1. **Karta** — `GET /api/actions/reply/[postId]`: tytuł, fragment posta,
   portfel autora, pole tekstu (textarea) i wybór kwoty (0.001 / 0.01 / 0.05 SOL).
2. **Transakcja** — `POST /api/actions/reply/[postId]?text=…&amount=…`,
   body `{ account }`. Dwie instrukcje, obie podpisuje odpowiadający:
   - Memo v2: `mysphere:reply|v1|<postId>|<tekst>`,
   - SystemProgram.transfer: odpowiadający → portfel autora, `amount`.
   Odpowiedź zawiera `links.next` (action chaining) → `/confirm`.
3. **Zapis** — `POST /api/actions/reply/[postId]/confirm`, body
   `{ account, signature }`. Serwer czyta transakcję z łańcucha i dopiero po
   pełnej weryfikacji zapisuje komentarz przez Firebase Admin.
4. **Strona dla wszystkich** — `/blink/reply/[postId]`, ten sam przepływ
   własnym portfelem (bez dial.to), z automatycznym ponowieniem `/confirm`.

## Weryfikacja przy zapisie (serwer)

Treść komentarza pochodzi **z memo na łańcuchu**, nie z żądania — zapisujemy
dokładnie to, co odpowiadający podpisał i opłacił.

- transakcja istnieje i przeszła (`meta.err === null`),
- płatnik opłaty = `account` z żądania,
- memo `mysphere:reply|v1|<postId>|…` z postId zgodnym z trasą, tekst niepusty,
  ≤ 280 bajtów UTF-8,
- transfer SystemProgram od `account` do portfela autora (ze zweryfikowanego
  kwitu posta) na ≥ 1 000 000 lamportów (0.001 SOL),
- dokument `comments/{signature}` tworzony przez `create()` — drugi zapis tego
  samego podpisu kończy się niczym, więc duplikat jest niemożliwy, a `/confirm`
  można bezpiecznie ponawiać.

Świeżości transakcji nie sprawdzamy: identyfikator = podpis wystarcza, a późne
zgłoszenie prawdziwej, opłaconej odpowiedzi nie jest nadużyciem.

## Zanim ktokolwiek zapłaci

Karta i budowa transakcji najpierw sprawdzają, czy serwer może zapisać
komentarz (`getAdminDb()` ≠ null). Bez tego ktoś zapłaciłby autorowi, a jego
odpowiedź nie miałaby gdzie wylądować.

Tekst jest walidowany **przed** zbudowaniem transakcji (pusty, za długi →
odmowa), zamiast przycinany — cichego obcinania cudzej opłaconej wypowiedzi
nie robimy.

## Zapis w Firestore

`comments/{signature}`: `author` (adres Solany), `authorName` (skrót
adresu), `content` (z memo), `postId`, `timestamp`, `likes: 0`, `likedBy: []`,
`mentions: []`, `txHash` (podpis), `network: 'solana'`, `onchain: true`,
`tipLamports`, `via: 'blink'`. Plus `commentsCount + 1` na poście — tylko przy
faktycznym utworzeniu dokumentu. Statystyk użytkownika nie ruszamy: dokument
`users/{adres}` istnieje tylko dla adresów EVM.

## UI

- Komentarz z `tipLamports` dostaje odznakę „paid reply · 0.01 SOL".
- Autor z adresem Solany wyświetla się skrótem (`displayUserName` robi to już
  dziś).

## Poza zakresem v1

Sortowanie po kwocie · odpowiedzi pod postami z sieci EVM · profil dla adresu
Solany (kliknięcie w autora otworzy pusty profil EVM — nie wywraca strony,
ale jest znanym ograniczeniem) · edycja i usuwanie przez odpowiadającego
(usuwa admin, jak dziś) · automatyczne odzyskiwanie odpowiedzi, której
`/confirm` nigdy nie dotarł (podpis wystarczy, by admin zapisał ją ręcznie
tym samym endpointem).

## Ryzyka

- Zapłacona odpowiedź bez zapisu, jeśli `/confirm` nie dotrze (zerwane
  połączenie po podpisie). Łagodzenie: endpoint idempotentny, nasza strona
  ponawia, admin może zgłosić podpis ręcznie.
- Rozwinięcie karty w X wymaga wpisu MySphere w Dialect Actions Registry
  (rejestr działa: 1015 hostów 2026-09-23; nas w nim nie ma).

## Testy

- Jednostkowe: format memo odpowiedzi, walidacja tekstu (bajty), odczyt
  transferu SystemProgram z surowych danych instrukcji, pełna weryfikacja
  transakcji odpowiedzi na fixture (zły płatnik, zły post, za mały napiwek,
  transfer do złego portfela, transakcja z błędem).
- Symulacja na mainnecie: transakcja z trasy POST przechodzi i weryfikator
  przyjmuje wynik symulacji.
