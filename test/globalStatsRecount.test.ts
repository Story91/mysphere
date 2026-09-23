export {};

// Czysta logika dobowego przeliczenia licznikow feedu: straznik sumy lajkow
// (app/utils/stats/recountGuard.ts) i podpis "kiedy policzono" pod panelem
// Trends (app/utils/stats/countedCaption.ts). Bez Firebase.
//
// Liczby w fixture'ach to stan z odczytu tylko do odczytu z 2026-09-23:
// 263 662 posty, 25 433 lajki, likesBaseline 18 817 z migawki.
const { expect } = require('chai');
const {
  judgeLikesRecount,
  previousLikesReference,
  ABSOLUTE_SLACK,
  LIKES_PER_POST_CEILING,
} = require('../app/utils/stats/recountGuard');
const { countedCaption, countedDate, STALE_AFTER_MS } = require('../app/utils/stats/countedCaption');

const POSTS = 263_662;
const HOUR = 60 * 60 * 1000;
// Poludnie UTC - ten sam dzien kalendarzowy w kazdej strefie od UTC-11 do UTC+11,
// wiec test nie zalezy od strefy maszyny.
const noonUtc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);

describe('Przeliczenie globalStats: punkt odniesienia dla lajkow', () => {
  it('bierze pelne `likes`, gdy juz jest', () => {
    expect(previousLikesReference({ likes: 25_433, likesBaseline: 18_817, likesSince: 40 })).to.equal(25_433);
  });

  it('przed pierwszym przebiegiem sklada likesBaseline + likesSince (panel admina zapisywal likes: null)', () => {
    expect(previousLikesReference({ likes: null, likesBaseline: 18_817, likesSince: 6_000 })).to.equal(24_817);
  });

  it('ujemne likesSince (nieatomowe -1) odejmuje, a nie jest pomijane', () => {
    expect(previousLikesReference({ likesBaseline: 100, likesSince: -3 })).to.equal(97);
  });

  it('bez niczego do porownania zwraca null', () => {
    expect(previousLikesReference(undefined)).to.equal(null);
    expect(previousLikesReference({ users: 184_064, likes: null })).to.equal(null);
    expect(previousLikesReference({ likesSince: 6 })).to.equal(null);
  });

  it('nie przyjmuje napisu ani ujemnej sumy jako punktu odniesienia', () => {
    expect(previousLikesReference({ likes: '25433' })).to.equal(null);
    expect(previousLikesReference({ likes: -5 })).to.equal(null);
  });
});

describe('Przeliczenie globalStats: straznik sumy lajkow', () => {
  it('przepuszcza oczekiwany pierwszy przebieg (25 433 wobec 18 817 + przyrost)', () => {
    // Najgorszy przypadek: likesSince = 0, czyli punkt odniesienia to sama
    // migawka. 25 433 / 18 817 = 1,35 - ponizej progu 2x.
    expect(judgeLikesRecount({ next: 25_433, previous: 18_817, posts: POSTS })).to.deep.equal({ ok: true });
  });

  it('przepuszcza zwykly dobowy przyrost i spadek', () => {
    expect(judgeLikesRecount({ next: 25_700, previous: 25_433, posts: POSTS }).ok).to.equal(true);
    expect(judgeLikesRecount({ next: 25_300, previous: 25_433, posts: POSTS }).ok).to.equal(true);
  });

  it('odrzuca podwojenie z dnia na dzien (jeden podrobiony zapis na poscie)', () => {
    const verdict = judgeLikesRecount({ next: 60_000, previous: 25_433, posts: POSTS });
    expect(verdict).to.include({ ok: false, reason: 'jump', next: 60_000, previous: 25_433 });
  });

  it('odrzuca spadek o ponad polowe (likes: -1e5 na jednym poscie)', () => {
    const verdict = judgeLikesRecount({ next: 10_000, previous: 25_433, posts: POSTS });
    expect(verdict).to.include({ ok: false, reason: 'drop' });
  });

  it('nie blokuje na zawsze malej poprzedniej liczby - luz bezwzgledny', () => {
    // Dokument mial kiedys likesSince: 6 i nic wiecej. 2 x 6 = 12 nie moze byc progiem.
    expect(judgeLikesRecount({ next: 900, previous: 6, posts: POSTS }).ok).to.equal(true);
    expect(judgeLikesRecount({ next: 6 + ABSOLUTE_SLACK + 1, previous: 6, posts: POSTS })).to.include({
      ok: false,
      reason: 'jump',
    });
  });

  it('bez punktu odniesienia pilnuje tylko sufitu', () => {
    expect(judgeLikesRecount({ next: 25_433, previous: null, posts: POSTS }).ok).to.equal(true);
    const ceiling = POSTS * LIKES_PER_POST_CEILING;
    expect(judgeLikesRecount({ next: ceiling + 1, previous: null, posts: POSTS })).to.include({
      ok: false,
      reason: 'ceiling',
      ceiling,
    });
  });

  it('odrzuca ulamek, ujemna sume i NaN', () => {
    expect(judgeLikesRecount({ next: 25_433.5, previous: 25_433, posts: POSTS })).to.include({ reason: 'not-integer' });
    expect(judgeLikesRecount({ next: -1, previous: null, posts: POSTS })).to.include({ reason: 'negative' });
    expect(judgeLikesRecount({ next: Number.NaN, previous: null, posts: POSTS })).to.include({ reason: 'not-integer' });
  });
});

describe('Panel Trends: podpis "kiedy policzono"', () => {
  const now = noonUtc(2026, 9, 24);

  it('swiezy pomiar: "Counted Sep 24" bez roku', () => {
    const caption = countedCaption(now - 2 * HOUR, now);
    expect(caption).to.deep.equal({ text: 'Counted Sep 24', date: 'Sep 24', stale: false });
  });

  it('po ponad 48 h mowi wprost, ze nikt nie przeliczyl', () => {
    const caption = countedCaption(noonUtc(2026, 8, 6), now);
    expect(caption).to.deep.equal({ text: 'Last counted Aug 6 · not updated since', date: 'Aug 6', stale: true });
  });

  it('granica 48 h: dokladnie 48 h to jeszcze swiezy, minuta dluzej juz nie', () => {
    expect(countedCaption(now - STALE_AFTER_MS, now)!.stale).to.equal(false);
    expect(countedCaption(now - STALE_AFTER_MS - 60_000, now)!.stale).to.equal(true);
  });

  it('dopisuje rok, gdy pomiar nie jest z biezacego roku', () => {
    expect(countedDate(noonUtc(2025, 8, 16), now)).to.equal('Aug 16, 2025');
    expect(countedCaption(noonUtc(2025, 8, 16), now)!.text).to.equal('Last counted Aug 16, 2025 · not updated since');
  });

  it('brak daty to brak podpisu, a nie zmyslona data', () => {
    expect(countedCaption(0, now)).to.equal(null);
    expect(countedCaption(undefined, now)).to.equal(null);
    expect(countedCaption(Number.NaN, now)).to.equal(null);
  });

  it('data z przyszlosci (zegar urzadzenia w tyle) liczy sie jako swieza', () => {
    expect(countedCaption(now + 3 * HOUR, now)!.stale).to.equal(false);
  });
});
