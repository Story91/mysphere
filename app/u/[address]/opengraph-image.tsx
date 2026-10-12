import { ImageResponse } from 'next/og';
import { getProfile } from '../../utils/profile/getProfile';
import { getName } from '../../utils/identity/getName';
import { shortAddress } from '../../utils/posts/getPostForShare';
import { ogFonts } from '../../components/og/fonts';
import { ProfileShareCard } from '../../components/og/SocialCards';

/**
 * Karta OG per profil.
 *
 * To jest ta polowa profilu, ktora ktos naprawde zobaczy: link wklejony na
 * X albo w Base App renderuje sie jako obrazek, zanim ktokolwiek kliknie.
 * Dlatego lezy tu ten sam zestaw liczb, co na stronie - nic dodatkowego,
 * nic upiekszonego.
 *
 * === TLO: JASNE, NIE GRANATOWE (decyzja wlasciciela z 2026-09-01) ===
 * Karta stala dotad na ciemnym granacie rodziny (#0A1024) i cala argumentacja
 * kolorow byla liczona wzgledem niego. Wlasciciel zarzadzil 2026-09-01 przejscie
 * na jasny grunt produktu; wszystkie SZESC kart .tsx (/, /leaderboard,
 * /post/[id], /startpad/[address], /tip/[txHash], /u/[address]) przechodzi na
 * niego RAZEM. Pojedyncza karta, ktora zostalaby ciemna, czytalaby sie w kanale
 * jak obrazek z innego serwisu, wiec rodziny nie wolno rozjechac w czasie.
 *
 * Tlo to #F1EDFA, czyli --soft-bg z app/globals.css - dokladnie to samo tlo, co
 * pod strona profilu, ktora ten obrazek zapowiada. Kontrasty ponizej sa liczone
 * wzgledem NOWEGO tla i kazdy przechodzi 4.5:1:
 *   #2E2A44  (--soft-ink)         11.9:1  - imie i wartosci statystyk,
 *   #6B6486  (--soft-ink-muted)    4.8:1  - nadtytul, adres, etykiety,
 *   #C2410C  (--soft-accent-deep)  4.50:1 - kwota.
 * Stare wartosci (#EEF3FF, #5C6F94, #00E28A) byly policzone pod granat i na
 * lawendzie nie znacza juz nic - dlatego znikly stad co do jednej.
 *
 * === DLACZEGO PRZEZROCZYSTOSCI SIE ODWRACAJA ===
 * Kafle statystyk mialy wypelnienie rgba(255,255,255,0.03) i obwodke
 * rgba(255,255,255,0.09). Na granacie to dzialalo, bo biel byla JASNIEJSZA od
 * tla. Na #F1EDFA ta sama biel sklada sie do okolo #F2EEFA, czyli mniej wiecej
 * 1.01:1 - kafel po prostu by zniknal. Na jasnym gruncie wypelnienie musi byc
 * KRYJACE (#FFFFFF, --soft-surface), a obwodka CIEMNIEJSZA od tla (#B9B1D8,
 * --soft-line-strong). To nie jest ta sama regula z inna liczba, tylko regula
 * odwrocona - kto bedzie przenosil pozostale karty, niech nie probuje podkrecac
 * alfy.
 *
 * === POMARANCZOWY ZNACZY KWOTE, NIE STAN ===
 * Kafel RECEIVED pokazuje odebrany napiwek, czyli PIENIADZE - a w tym produkcie
 * pomaranczowy jest zarezerwowany dla kwot i nigdzie indziej sie nie pojawia
 * (regula spisana w app/admin/ops/OpsConsole.tsx:27). Dlatego zielen #00E28A
 * idzie tu na #C2410C, a nie na zielen statusu. Gdyby to samo zielone oznaczalo
 * STAN (kropka "ok", napis "SETTLED ONCHAIN"), musialoby pojsc na #1E7A55
 * (4.59:1) - pomaranczowa odznaka stanu czytalaby sie jak kwota i karta
 * klamalaby o sobie samej. W tej karcie zadnego stanu nie ma, jest tylko liczba.
 */

export const runtime = 'nodejs';
export const alt = 'Profile on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function formatAmount(value: number): string {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '');
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export default async function Image({ params }: { params: { address: string } }) {
  const profile = await getProfile(params.address);

  const address = profile?.address ?? params.address;
  const basename = profile
    ? await getName({ address: address as `0x${string}` }).catch(() => null)
    : null;
  const name = basename || profile?.storedName || shortAddress(address);

  const topTip = Object.entries(profile?.tips.received ?? {})
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])[0];

  const stats: { value: string; label: string; amount?: boolean }[] = [
    { value: String(profile?.postCount ?? 0), label: 'posts' },
    { value: String(profile?.likesReceived ?? 0), label: 'likes' },
    { value: String(profile?.tips.receivedCount ?? 0), label: 'tips in' },
  ];

  if (topTip) {
    stats.push({ value: `${formatAmount(topTip[1])} ${topTip[0]}`, label: 'received', amount: true });
  }

  // Rysunek: ProfileShareCard (app/components/og/SocialCards.tsx).
  return new ImageResponse(
    <ProfileShareCard name={name} address={basename ? shortAddress(address) : null} stats={stats} />,
    { ...size, fonts: await ogFonts() }
  );
}
