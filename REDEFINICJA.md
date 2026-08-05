# MySphere — redefinicja

Stan: 5 sierpnia 2026. Dokument roboczy, nie manifest.

---

## Dlaczego w ogóle redefinicja

Trzy fakty ustalone researchem, każdy zweryfikowany u źródła:

1. **Base publicznie porzuciło kierunek, w którym MySphere szło.** Jesse Pollak, 15 lipca 2026: *„The entire social side of the market that many of us had been building towards — Farcaster, Zora, miniapps, and yes, creator coins — disintegrated completely. […] I was wrong."* Priorytety Base na 2026: **trading, payments, agents**.

2. **Rynek creator coins już nie istnieje.** ZORA −95% od szczytu, Base wygasiło Creator Rewards w lutym 2026, Armstrong przyznał porażkę w lipcu. Liczby o „22 tys. twórców" krążące w materiałach strategicznych pochodzą z lipca **2025**.

3. **x402 działa realnie i rośnie.** 75,4 mln transakcji w 30 dni, fundacja z Coinbase, Cloudflare i AWS. To jedyna warstwa z poprzedniej roadmapy, której research nie podważył.

Wniosek nie brzmi „social umarł". Brzmi: **social sam w sobie przestał być powodem, dla którego ktoś wchodzi.**

---

## Co MySphere ma, czego nie ma nikt inny

Nie feed. Feedów są dziesiątki.

**KYA — zweryfikowana tożsamość agenta AI — połączona z x402, czyli możliwością zapłacenia mu i przez niego.** To jest jedyne miejsce, gdzie zaufanie do agenta i płatność za jego pracę spotykają się w jednym przepływie. I trafia dokładnie w to, co Base nazwało swoim priorytetem („agents").

Co z tego realnie istnieje w kodzie dzisiaj:

| Element | Stan |
|---|---|
| Klient KYA (`vendor/kya`, `lib/kya.ts`) | działa, zvendorowany |
| Rejestr agentów (`/MyAgents`) + reputacja, feedback, trust badge | **działa**, hooki `useAgents`/`useAgent`/`useFeedback` gotowe do reużycia |
| Endpointy x402 (`/api/myclaw/*`) | szkielet + cennik; **egzekwowania płatności brak** |
| Certyfikacja agenta (`/api/myclaw/certify`) | zwraca `passed: true` bezwarunkowo, bez kontraktu |
| Graf społecznościowy + tipy (`saveTip`) | działa |
| Feed, posty multi-chain, przypięcia płatne | działa |

Czyli: **rejestr zaufania jest zbudowany, warstwa płatności jest zaszkicowana, spina ich nic.**

---

## Teza

> MySphere przestaje być „onchain social" i staje się miejscem, gdzie **agenty AI są weryfikowalne i opłacalne** — a feed jest powierzchnią, na której tę aktywność widać.

Czat zostaje. Zmienia się to, po co się w nim jest: nie żeby postować, tylko żeby **widzieć, komu ufać, i móc mu zapłacić**.

Dlatego wyłączyliśmy resztę modułów. Nie dlatego, że są złe — dlatego, że rozpraszają, a każdy z nich ciągnie za sobą utrzymanie.

---

## Plan

### Faza 0 — fundament, bez którego nic nie ruszy

Nie jest opcjonalna. To nie jest „porządkowanie", tylko rzeczy, które dziś **blokują** budowanie czegokolwiek.

| # | Co | Dlaczego blokuje |
|---|---|---|
| 0.1 | **Migracja OnchainKit → wagmi + `@base-org/account`** | Logowanie stoi na bibliotece wygaszonej 19 marca 2026, npm zamrożony na 1.1.2, docs usunięte, termin migracji minął w maju. Każdy nowy feature dotykający portfela buduje na martwym fundamencie. |
| 0.2 | **Podbicie 4 zależności** | `@farcaster/miniapp-sdk` 0.2.1→0.3.0, `miniapp-wagmi-connector` 1.1.0→**2.0.0** (major), `@zoralabs/coins-sdk` 0.2.11→0.8.0 |
| 0.3 | **Dual-mode: Base App + Farcaster** | Od 9 kwietnia 2026 Base App traktuje appki jak zwykłe web appy i nie woła SDK Farcastera. Farcaster nadal aktywnie rozwija spec (commity z 4 sierpnia). To dwa różne klienty, nie jeden standard. |
| 0.4 | **Reguły Firestore + dokończenie SIWE** | Backend SIWE stoi, ale bez zaciśnięcia reguł klient nadal pisze do bazy z pominięciem tras. Agenty płacące za akcje wymagają, żeby serwer wiedział, kto pyta. **Blokada: potrzebny eksport reguł z konsoli.** |

### Faza 1 — most KYA ↔ x402

To jest produkt. Reszta była przygotowaniem.

| # | Co | Na czym stoi |
|---|---|---|
| 1.1 | **x402 v2 w projekcie** — `@x402/next` 2.21.0, sieci w CAIP-2 (`eip155:8453`), nagłówki `PAYMENT-SIGNATURE`, plik `proxy.ts` | Pakiety, do których odwołuje się dziś kod (`x402-next`), to martwa gałąź v1 |
| 1.2 | **Realna certyfikacja agenta** — weryfikacja ukończenia lekcji, test, dopiero potem wynik | Dziś `passed: true` dla każdego. Bez tego włączenie płatności = sprzedawanie certyfikatu za nic |
| 1.3 | **Egzekwowanie płatności** na lekcjach, wyzwaniach i certyfikacji | Wymaga 1.1 i 1.2. Dopiero teraz to jest „przełącznik" |
| 1.4 | **Odznaka agent/człowiek + trust score KYA w feedzie** | `useAgents` gotowe. Najtańszy sposób, żeby teza była widoczna od pierwszego ekranu |
| 1.5 | **„Wynajmij agenta" w feedzie** — zlecenie i płatność x402 bez wychodzenia z czatu | Wymaga 1.1 i 0.4 |

### Faza 2 — pieniądz w social, ale nie spekulacja

Zgodne z kierunkiem Base (payments), bez zakładów na trupa creator coins.

- **Subskrypcje twórców** przez x402 zamiast jednorazowych tipów — `saveTip` już istnieje
- **Tip-to-unlock** — treść premium za mikropłatność
- **Dynamiczne karty OG** per post/profil/agent — layout jest już serwerowy z Metadata API, więc `generateMetadata` jest wykonalne. Base App traktuje appki jak strony, więc bogaty embed to realna powierzchnia dystrybucji

### Czego NIE robimy i dlaczego

| Odrzucone | Powód |
|---|---|
| Auto-coin profilu, attention market, remix z rev-share | Rynek creator coins zawalił się w 2026; najwyższy wysiłek i ryzyko w całej liście, wycelowane w segment, którego nie ma |
| „Stock Card" na tokenizowanych akcjach | Stock Tokens to papiery **dłużne** emitenta z Jersey, dostępne wyłącznie klientom Robinhood po KYC, z wykluczeniem USA, Kanady, UK, Szwajcarii i ZEA. Nie da się tego udostępnić dowolnemu adresowi |
| Mikro-predykcje na postach | Najwyższy wysiłek w roadmapie, wymaga oracle i rozliczeń. Rozważyć dopiero, gdy warstwa płatności działa |

Robinhood Chain jako **sieć** (chainId 4663) — do rozważenia później, godzina roboty tym samym wzorcem co Linea/Celo. Ale bez `Stock Card` jest to kolejny łańcuch bez powodu, a mamy ich już siedem.

---

## Kolejność

Faza 0 nie jest negocjowalna — 0.1 i 0.4 blokują wszystko z fazy 1.

W fazie 1 kolejność też jest wymuszona: **1.1 → 1.2 → 1.3**. Odwrócenie jej (czyli „włączmy płatności, bo endpointy są") oznacza pobieranie pieniędzy za endpoint, który każdemu przyznaje certyfikat.

1.4 można zrobić równolegle — nie zależy od płatności, a najszybciej pokazuje, czym MySphere ma być.

---

## Otwarte pytania do właściciela

1. **Reguły Firestore** — potrzebny eksport z konsoli. Bez tego 0.4 stoi, a razem z nim cała faza 1.
2. **Czy MyClaw Academy zostaje?** Jeśli tezą są agenty, to akademia ucząca agentów ma sens. Ale wymaga zbudowania realnej certyfikacji od zera (1.2). Alternatywa: wyciąć i skupić się na rejestrze + wynajmie.
3. **`NEXT_PUBLIC_COINBASE_PRIVATE_KEY`** wciąż w env Vercela — 0 użyć w kodzie, ale publiczny prefiks. Do rotacji i usunięcia.
4. **Automatyczny deploy z GitHuba nie działa od 166 dni.** Dopóki nie znajdziemy przyczyny w Settings → Git, każdy release wymaga ręcznego `vercel --prod`.
