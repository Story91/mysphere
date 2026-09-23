import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '../../../utils/auth/firebaseAdmin';
import { judgeLikesRecount, previousLikesReference } from '../../../utils/stats/recountGuard';

/**
 * DOBOWE PRZELICZENIE LICZNIKOW FEEDU - jedyny zapis do `globalStats/current`.
 *
 * ===========================================================================
 * CO BYLO WCZESNIEJ
 * ===========================================================================
 * Panel Trends czyta jeden dokument `globalStats/current` (getGlobalStats
 * w app/utils/stats/globalStats.ts). Ten dokument zapisywaly CZTERY rozne
 * drogi i zadna nie byla automatyczna:
 *   (a) scripts/seedGlobalStats.cjs - raz, recznie, 6 sierpnia;
 *   (b) panel admina po kliknieciu "Policz" - z przegladarki, `likes: null`;
 *   (c) scripts/setLikesBaselineFromSnapshot.cjs - stan poczatkowy lajkow
 *       wyjety z zamrozonej migawki w historii kodu;
 *   (d) toggleLike - `likesSince: increment(+-1)` z KAZDEJ przegladarki.
 * Czyli liczby staly, dopoki ktos nie pamietal kliknac, a lajki byly suma
 * starej migawki i licznika, ktory mogl zmienic kazdy z konsoli przegladarki
 * (regula dla `globalStats` to ogolne "kazdy moze wszystko").
 *
 * Teraz: raz na dobe ta trasa liczy wszystko agregacja po stronie serwera
 * i zapisuje kluczem administracyjnym. Drogi (b) i (d) usuniete z kodu,
 * (a) i (c) to martwe skrypty. Regula Firestore zamykajaca zapis z przegladarki
 * to osobny krok wlasciciela (patrz nizej, KOLEJNOSC).
 *
 * ===========================================================================
 * DLACZEGO AGREGACJA JEST TERAZ OK
 * ===========================================================================
 * W sierpniu agregacje w tym projekcie zwracaly RESOURCE_EXHAUSTED nawet dla
 * pustych kolekcji i to dlatego lajki liczyl przyrostowy licznik w
 * przegladarce. Sonda tylko do odczytu z 2026-09-23 przeszla bez bledu:
 * count() na czterech kolekcjach i sum('likes') na postach, okolo 715
 * odczytow. Z odczytem poprzedniego dokumentu przebieg kosztuje okolo 730
 * odczytow na dobe - pomijalnie, a feed dalej placi JEDEN odczyt na wejscie.
 *
 * Gdy limit wroci, agregacja rzuci, trasa zwroci 503 i NIE zapisze niczego.
 * Stare liczby zostaja, ich data sie starzeje, a po 48 godzinach panel Trends
 * pisze "not updated since" (app/utils/stats/countedCaption.ts).
 *
 * ===========================================================================
 * HARMONOGRAM: "0 5 * * *" w vercel.json
 * ===========================================================================
 * Raz na dobe, 05:00 UTC - godzine przed /api/curator-watch, zeby dwa crony
 * nie startowaly w tej samej minucie. Czesciej nie ma po co: panel pokazuje
 * date pomiaru, a nie udaje transmisji na zywo. Harmonogram dobowy miesci sie
 * tez w limicie najnizszego planu Vercela.
 *
 * ===========================================================================
 * KOLEJNOSC WDROZENIA (dla wlasciciela)
 * ===========================================================================
 *   1. Wdrozyc kod (ta trasa, vercel.json, usuniete zapisy z przegladarki).
 *   2. Zawolac trase RAZ recznie z sekretem i sprawdzic, ze dokument ma `likes`
 *      i nie ma juz pol likesSince / likesBaseline*.
 *   3. Dopiero potem wdrozyc reguly (`globalStats`: odczyt tak, zapis nie).
 * Karty przegladarki ze starym kodem pisza likesSince do czasu kroku 3 - to
 * nieszkodliwe, bo likesTotal() bierze `likes`, gdy tylko istnieje.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Piec agregacji rownolegle. Zwykle trwa to sekundy; 30 s to zapas. */
export const maxDuration = 30;

type Outcome = {
  ok: boolean;
  step: string;
  detail?: string;
  users?: number;
  posts?: number;
  comments?: number;
  tips?: number;
  likes?: number;
  previousLikes?: number | null;
  ceiling?: number;
};

function fail(status: number, body: Outcome) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  /**
   * === BRAK SEKRETU TO ODMOWA, A NIE OTWARTE DRZWI ===
   * Blok skopiowany z app/api/curator-watch/route.ts i z tego samego powodu:
   * kazde wolanie kosztuje okolo 730 odczytow i zapisuje do dokumentu, ktory
   * widzi kazdy gosc. Otwarta trasa bylaby zaproszeniem do wypalania limitu
   * odczytow petla z zewnatrz. Vercel sam dokleja `Authorization: Bearer
   * $CRON_SECRET`, gdy zmienna jest ustawiona w projekcie.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return fail(503, {
      ok: false,
      step: 'auth',
      detail: 'CRON_SECRET nie jest ustawiony. Trasa odmawia zamiast dzialac bez zabezpieczenia.',
    });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return fail(401, { ok: false, step: 'auth', detail: 'Unauthorized' });
  }

  const db = await getAdminDb();
  if (!db) {
    // getAdminDb() zwraca null przy braku GOOGLE_CREDENTIALS albo gdy pakiet
    // sie nie zaladowal - szczegol jest juz w logu z firebaseAdmin.ts.
    return fail(503, { ok: false, step: 'admin-db', detail: 'Firebase Admin nie jest dostepny.' });
  }

  /**
   * CALA reszta w try/catch. Promise.all odrzucony przez ktorakolwiek
   * agregacje (RESOURCE_EXHAUSTED, timeout, siec) bez tego wyszedlby jako 500
   * ze strona bledu. Zapisu i tak by nie bylo, ale 503 z powodem mowi w logach
   * Vercela, ze to przejsciowe i ze stare liczby sa nietkniete.
   */
  try {
    const { AggregateField, FieldValue } = await import('firebase-admin/firestore');
    const ref = db.doc('globalStats/current');

    const [previousSnap, usersAgg, postsAgg, commentsAgg, tipsAgg, likesAgg] = await Promise.all([
      ref.get(),
      db.collection('users').count().get(),
      db.collection('posts').count().get(),
      db.collection('comments').count().get(),
      // Surowa liczba dokumentow w `tips` - NIE to samo co totalTips z
      // getLeaderboard(), ktory filtruje po odbiorcy i kwocie > 0. Zapisujemy
      // ja, bo dokument zawsze ja mial, ale panel Trends jej nie pokazuje.
      db.collection('tips').count().get(),
      db.collection('posts').aggregate({ likes: AggregateField.sum('likes') }).get(),
    ]);

    const users = usersAgg.data().count;
    const posts = postsAgg.data().count;
    const comments = commentsAgg.data().count;
    const tips = tipsAgg.data().count;
    const likes = likesAgg.data().likes;

    // ===== STRAZNIK SUMY LAJKOW =====
    // Uzasadnienie w app/utils/stats/recountGuard.ts. W skrocie: `posts.likes`
    // zmienia przegladarka, wiec jeden podrobiony zapis przesuwa sume
    // dowolnie. Przy podejrzanym skoku nie zapisujemy NICZEGO - tez nie
    // pozostalych liczb, bo dokument z mieszanka swiezych i starych pol pod
    // jedna data `measuredAt` klamalby o wieku tych starych.
    const previousLikes = previousLikesReference(previousSnap.exists ? previousSnap.data() : undefined);
    const verdict = judgeLikesRecount({ next: likes, previous: previousLikes, posts });
    if (!verdict.ok) {
      console.error(
        '[stats/recount] Straznik odrzucil sume lajkow:',
        verdict.reason,
        'nowa',
        verdict.next,
        'poprzednia',
        verdict.previous,
        'sufit',
        verdict.ceiling,
        '- nic nie zapisano.'
      );
      return fail(409, {
        ok: false,
        step: 'likes-guard',
        // Wskazowka zalezy od powodu. Nowe `likes` w globalStats pomaga TYLKO
        // przy jump/drop, bo przesuwa punkt odniesienia. Przy not-integer
        // (ulamek, NaN), negative i ceiling zla jest sama suma, bo zly jest
        // ktorys post - wpis w globalStats niczego nie zmieni i cron odmowi
        // znowu nastepnej doby.
        detail:
          verdict.reason === 'jump' || verdict.reason === 'drop'
            ? `Suma lajkow odrzucona (${verdict.reason}). Jesli zmiana jest prawdziwa, wpisz nowa wartosc w globalStats/current.likes z konsoli Firebase - nastepny przebieg porowna sie do niej.`
            : `Suma lajkow odrzucona (${verdict.reason}). Wpis w globalStats tu nie pomoze: ktorys post ma zle pole likes (ulamek, NaN, ujemne albo absurdalnie duze). Znajdz go (posts orderBy likes asc i desc, limit 5) i popraw.`,
        likes: verdict.next,
        previousLikes: verdict.previous,
        ceiling: verdict.ceiling,
      });
    }

    await ref.set(
      {
        users,
        posts,
        comments,
        tips,
        likes,
        // Pola po licznikach, ktore ta trasa zastepuje. Kasujemy je, zeby
        // dokument mial jedno zrodlo lajkow, a nie trzy do pogodzenia.
        // likesTotal() i tak bierze `likes`, gdy tylko istnieje.
        likesSince: FieldValue.delete(),
        likesSinceStartedAt: FieldValue.delete(),
        likesBaseline: FieldValue.delete(),
        likesBaselineAt: FieldValue.delete(),
        likesBaselineSource: FieldValue.delete(),
        likesBaselineCommit: FieldValue.delete(),
        measuredAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      step: 'done',
      users,
      posts,
      comments,
      tips,
      likes,
      previousLikes,
    } satisfies Outcome);
  } catch (error) {
    console.error('[stats/recount] Przeliczenie nie powiodlo sie, nic nie zapisano:', error);
    return fail(503, {
      ok: false,
      step: 'recount',
      detail: error instanceof Error ? error.message : 'Nieznany blad',
    });
  }
}
