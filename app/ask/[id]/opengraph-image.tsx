import { ImageResponse } from 'next/og';
import { AskShareCard, ASK_OG_CACHE_HEADERS } from '../../components/og/AskShareCard';
import { PageShareCard } from '../../components/og/PageShareCard';
import { ogFonts } from '../../components/og/fonts';
import { getAskForShare } from '../../utils/asks/getAskForShare';
import { shareSeatsLeft, shareTakesAnswers } from '../../utils/asks/askPublicView';
import { shareAmount } from '../../utils/asks/shareAmount';

/**
 * Karta OG jednego Aska: kwota za odpowiedz + pytanie.
 *
 * Plakietka stanu tylko dla Askow, ktorych stan jest sprawdzony (sealed /
 * legacy) - ta sama granica, co `statesSeats` w askPublicView.ts. Ask
 * nieznany albo niedostepny dostaje uczciwa karte Askow, a nie blad: podglad
 * linku bez obrazka jest gorszy niz karta mowiaca, gdzie ktos trafil.
 */

export const runtime = 'nodejs';
export const revalidate = 300;
export const alt = 'A question with a budget on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { id: string } }) {
  const share = await getAskForShare(params.id).catch(() => null);
  const fonts = await ogFonts();

  if (!share) {
    return new ImageResponse(
      <PageShareCard eyebrow="MYSPHERE ASKS" headline="Ask with a budget." subline="Answers stay sealed. Payouts onchain." />,
      { ...size, fonts }
    );
  }

  const { ask, trust } = share;
  const checked = trust === 'sealed' || trust === 'legacy';
  const open = shareTakesAnswers(share);
  const left = shareSeatsLeft(share);
  const state = !checked
    ? null
    : open
      ? { label: `OPEN · ${left} ${left === 1 ? 'SEAT' : 'SEATS'} LEFT`, open: true }
      : { label: ask.status === 'resolved' ? 'RESOLVED' : 'CLOSED', open: false };

  return new ImageResponse(
    <AskShareCard
      perAnswer={shareAmount(ask, 'perAnswer')}
      budget={shareAmount(ask, 'budget')}
      seats={ask.seats}
      question={ask.question}
      state={state}
      escrowed={share.escrow !== null}
    />,
    { ...size, headers: ASK_OG_CACHE_HEADERS, fonts }
  );
}
