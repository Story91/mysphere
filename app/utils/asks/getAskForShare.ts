import { cache } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { readAskShare } from '../../api/asks/askPublicRead';
import { getPublicDb as getDb } from '../publicFirestore';
import { toAsk } from './askMapping';
import { shareUnchecked, type AskShare } from './askPublicView';
import { isDocId } from './askSealCore';

/**
 * Odczyt POJEDYNCZEGO Aska po stronie serwera - na potrzeby udostepnialnej
 * trasy /ask/[id] i jej metadanych (podglad linku).
 *
 * ===========================================================================
 * PO CO TA TRASA W OGOLE POWSTALA
 * ===========================================================================
 * Ask byl jedynym wlasnym obiektem tego produktu BEZ ADRESU. Post ma
 * /post/[id], napiwek ma /tip/[txHash], czlowiek ma /u/[address] - kazde
 * z wlasna karta podgladu. Aska nie dalo sie nawet zalinkowac: mozna bylo
 * wyslac komus /asks i kazac szukac.
 *
 * To boli podwojnie, bo Ask jest OFERTA PRACY z terminem. Jego cala wartosc
 * polega na tym, ze dotrze do kogos, kto potrafi odpowiedziec - a dotrzec moze
 * tylko wtedy, gdy da sie go wkleic.
 *
 * ===========================================================================
 * SKAD DANE (plan, krok 12)
 * ===========================================================================
 * Strona jest publiczna i czytaja ja crawlery, wiec nie moze powtarzac
 * niesprawdzonych zdan o pieniadzach. Dokument asks/{id} zapisuje dzis kazda
 * przegladarka: `status: 'resolved'` dawal "Settled: the budget has been paid
 * out.", a `funding: 'escrowed'` z dowolnym hashem - "locked in an escrow
 * contract" z linkiem do "depozytu".
 *
 * Dlatego najpierw magazyn Askow (admin SDK, pieczecie) przez
 * app/api/asks/askPublicRead.ts - osobny modul z 'server-only', zeby zaden
 * pakiet kliencki nie wciagnal admin SDK. Z niego status i escrow sa prawda
 * (Ask zapieczetowany) albo dzisiejsza semantyka sprzed pieczeci ('legacy').
 * Gdy magazyn jest niedostepny (brak konta uslugowego, awaria), strona MUSI
 * sie dalej renderowac: czytamy sam dokument klienckim SDK i oznaczamy go
 * 'unchecked' - strona mowi wtedy neutralnie (askPublicView.ts).
 *
 * Mapowanie dokumentu to toAsk z askMapping.ts - to samo co w feedzie, wiec
 * ta sama karta nie pokaze innej kwoty w feedzie i po wklejeniu linku.
 *
 * To sa dane PUBLICZNE: tresc pytania, budzet i termin widzi kazdy
 * w feedzie. Zapieczetowane sa ODPOWIEDZI, a tych ten odczyt nie dotyka.
 */

const ASKS = 'asks';

export type { AskShare };

/**
 * Ask do strony udostepniania albo null (404).
 *
 * `cache` z Reacta: generateMetadata i sama strona pytaja o tego samego Aska
 * w jednym renderze - bez tego kazde wejscie robiloby odczyty podwojnie.
 */
export const getAskForShare = cache(async (askId: string): Promise<AskShare | null> => {
  const id = typeof askId === 'string' ? askId.trim() : '';
  // Scisle id: to samo, co przyjmuja trasy Askow. Id spoza tego ksztaltu
  // powstaja tylko z zapisu z przegladarki i nie da sie ich obsluzyc.
  if (!isDocId(id)) return null;

  const verified = await readAskShare(id);
  if (verified.kind === 'ok') return verified.share;
  if (verified.kind === 'missing') return null;

  try {
    const snapshot = await getDoc(doc(getDb(), ASKS, id));
    if (!snapshot.exists()) return null;
    return shareUnchecked(toAsk(snapshot.id, snapshot.data() as Record<string, any>));
  } catch (error) {
    // `null` znaczy tu "nie mamy czego pokazac" i wolajacy robi z tego 404.
    // Rzucenie wywalaloby cala trase, a nieudany odczyt jednego dokumentu nie
    // jest awaria warta pustej strony bledu.
    console.error('[ask-share] Odczyt Aska nie powiodl sie:', error);
    return null;
  }
});

/** Skrot adresu dla naglowka. Ten sam ksztalt co przy postach. */
export function shortAskAuthor(address: string): string {
  if (!address || address.length < 10) return address || 'unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
