# Solana w basechacie

Stan na 22 września 2026. Wdrożone, nieprzetestowane ręcznie przez właściciela.

## Co zostało zrobione i dlaczego akurat tak

MySphere miała do tej pory osiem łańcuchów i wszystkie były EVM. Solana jest
pierwszym wyjątkiem, więc pierwsza decyzja dotyczyła nie kodu, tylko zakresu.

**Post w tej aplikacji nie żyje onchain.** Treść, lajki, komentarze i profile
siedzą w Firestore (`createPost` w `app/utils/firebase.ts`). Łańcuch dostaje
wyłącznie kwit — podpis transakcji zapisany w polu `txHash`. Zmierzone: żadna
trasa serwerowa tego podpisu nie weryfikuje. Weryfikacja receiptów istnieje
tylko tam, gdzie idą pieniądze (Aski w `app/api/asks/[id]/escrow-resolve`,
piny w `app/api/sync-pin-events`).

Z tego wynikły dwa możliwe zakresy:

| | Logowanie portfelem Solany | Kwit na Solanie dla użytkownika EVM |
|---|---|---|
| Tożsamość | przepisana od zera | nietknięta |
| Zasięg zmian | `wagmi` w 100 plikach, `useAccount` w 88, `0x${string}` w 276 miejscach, SIWE przypięte do chainId 8453 | jeden nowy przycisk |
| Co się psuje | profile, follow, tipy, ranking, bany — wszystko kluczowane adresem `0x` | nic |
| Czas | tygodnie | dzień–dwa |

Wybrany został wariant drugi. **Autorem posta pozostaje adres EVM z wagmi.**
Portfel Solany podpisuje wyłącznie kwit.

## Dlaczego Memo Program, a nie własny program w Anchorze

Skoro kwit jest jedynym zadaniem transakcji, własny program nie dodałby nic
poza kosztem: depozytem rent za bajtkod (rzędu 1–2 SOL), łańcuchem narzędzi
Rusta w repo, które dziś jest w całości TypeScriptem, i drugą rzeczą do
utrzymywania. Memo Program stoi na mainnecie i devnecie od lat i nie kosztuje
nic.

Własny program zacznie mieć sens dopiero wtedy, gdy post ma faktycznie żyć
onchain — indeksowanie, odczyt feedu z łańcucha, nagrody za posty.
`app/basechat/Solana/config/solanaChain.ts` jest jedynym miejscem, które o tym
wie.

## Pliki

**Nowe**

| Plik | Rola |
|---|---|
| `app/basechat/Solana/config/solanaChain.ts` | klaster, RPC, adres Memo, link do eksploratora, budowa treści memo |
| `app/basechat/Solana/config/SolanaPostingConfig.tsx` | wygląd composera |
| `app/basechat/Solana/components/SolanaWalletProvider.tsx` | drugi stack portfeli, ładowany leniwie |
| `app/basechat/Solana/components/SolanaPostButton.tsx` | transakcja memo zamiast `writeContract` |
| `app/basechat/Solana/components/CreatePostSolana.tsx` | spina powyższe, bramkuje miniapp |
| `app/hooks/useIsFarcasterMiniApp.ts` | wykrycie webview Farcastera |
| `public/solana.svg` | znak sieci |

**Zmienione**

- `app/basechat/chainPosting/ChainCreatePost.tsx` — nowy opcjonalny prop
  `PostButton` i typ `ComposerOnlyConfig`. Sześć istniejących sieci EVM nie wie,
  że coś się zmieniło.
- `app/basechat/page.tsx` — zakładka, deep link `?network=`, typ `PostingNetwork`
- `app/basechat/components/PostList.tsx` — odznaka i eksplorator
- `app/basechat/soft/SoftStoryRail.tsx` — wpis w `SOFT_NETWORKS`
- `app/components/NetworkSwitcher/NetworkSwitcher.tsx` — wpis nawigacyjny
- `app/types.ts`, `app/utils/firebase.ts` — `'solana'` w uniach `network`
- `app/how/page.tsx` — liczba łańcuchów (była nieaktualna już przed tą zmianą:
  mówiła o siedmiu, a Arc stał tam ósmy)

## Trzy rzeczy, które wyglądają na drobiazgi, a nie są

**1. `solanaChain.ts` nie może importować z `@solana/web3.js`.**
Czyta go również `PostList`, a ten siedzi w głównym bundlu feedu. Jeden import
web3.js w configu przeciągnąłby cały stack Solany (207 pakietów) do każdego
użytkownika, który otwiera feed — czyli dokładnie to, czemu zapobiega
dynamiczne ładowanie providera. Dlatego adres programu jest stringiem, a
`new PublicKey(...)` powstaje dopiero w przycisku.

**2. Globalny `Buffer` nie istnieje w bundlu przeglądarkowym Next.js.**
`SolanaPostButton` importuje go jawnie z `'buffer'`. Bez tego `Buffer.from(...)`
wywaliłoby się w runtime — już **po** tym, jak użytkownik podpisze transakcję.

**3. Blockhash pobierany jest raz.**
Ten sam obiekt idzie do wysyłki i do `confirmTransaction`. Drugie
`getLatestBlockhash` po wysłaniu potrafi zwrócić nowszy blok i wtedy
potwierdzenie wygasa mimo udanej transakcji.

## Miniapp Farcastera

Phantom, Solflare i Backpack to rozszerzenia przeglądarki. W webview
Farcastera nie istnieją i nie pojawią się — portfel jest tam wstrzykiwany przez
hosta i jest to portfel EVM.

Dlatego zakładka Solany w miniappie **znika**, a deep link `?network=solana`
pokazuje wyjaśnienie zamiast formularza. Bez tego byłby to przycisk otwierający
wybór portfela, w którym nie ma czego wybrać — dokładnie to, czym przez miesiąc
był Robinhood z pustym adresem kontraktu.

Hook zwraca trzy stany, nie dwa. `null` znaczy „jeszcze nie wiem" i wstrzymuje
render, żeby zakładka nie mignęła użytkownikom miniappa przed schowaniem.

## Klaster

Domyślnie **devnet**. SOL z faucetu jest darmowy, więc development i testy nie
kosztują nic.

Mainnet włącza jedna zmienna, bez zmiany kodu:

```
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
```

Pod mainnet ustaw też własny RPC — publiczny `api.mainnet-beta.solana.com` jest
mocno rate-limited i Solana Foundation wprost odradza go w produkcji:

```
NEXT_PUBLIC_SOLANA_RPC_URL=https://...
```

## Koszty

- Deploy: **0** — Memo Program jest cudzy i już stoi.
- Transakcja posta: ~0,000005 SOL, płaci ją **portfel użytkownika**.
- Brak keepera, więc **brak dosypywania gazu** — inaczej niż przy perps na Arc.
- Budżet właściciela na własne testy na mainnecie: ~0,05 SOL z zapasem.

## Czego świadomie NIE zrobiono

**Tipy.** `TipNetworkType` w `app/utils/firebase.ts` pozostaje bez `'solana'`.
Tipy dotykają pieniędzy, escrow i kwitów weryfikowanych po stronie serwera —
to osobny zakres, nie dopisek.

**Komentarze onchain na Solanie.** `COMMENT_BUTTON_BY_CHAIN` w `PostList` jest
kluczowane numerycznym chainId, którego Solana nie ma. Zachowanie nie uległo
pogorszeniu: przycisk komentarza zawsze zależał od sieci **portfela**, a nie od
sieci posta, więc użytkownik na Base komentujący post z Solany zapisuje kwit na
Base — tak samo jak dziś komentuje posty z Celo.

**Solana jako sieć logowania.** Patrz tabela na górze.

## Stan weryfikacji

- `tsc --noEmit` — czysto (błędy w `test/` są sprzed tej zmiany, dotyczą
  Hardhata i nie wchodzą do `next build`).
- `next build` — przechodzi.
- **Nie przeklikane w przeglądarce.** `/basechat` stoi za bramką „Connect
  wallet", a podpięcie portfela należy do właściciela.

Żeby zobaczyć to na żywo: Phantom przełączony na devnet
(Settings → Developer Settings → Devnet), darmowy SOL z faucet.solana.com,
`npm run dev`, portfel EVM jak zwykle, zakładka Solana.
