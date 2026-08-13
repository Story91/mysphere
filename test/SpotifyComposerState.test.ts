export {};

const { expect } = require('chai');
const { spotifyFailureKind } = require('../app/basechat/components/spotifyState');

/**
 * SPOTIFY W KOMPOZYTORZE: "nie podlaczyles konta" to NIE JEST awaria.
 *
 * Zgloszenie: kto nie ma podpietego Spotify, dostawal w okienku wyboru utworu
 * czerwone "❌" z przyciskiem Try Again. Ponawianie nie moglo pomoc - nie bylo
 * czego ponawiac, bo konto po prostu nie jest podlaczone. Zamiast tego ma tam
 * stac konektor, ktorym da sie je podpiac BEZ wychodzenia z pisania posta.
 *
 * Trasa /api/camp/spotify rozroznia te dwa przypadki, tylko subtelnie:
 *   - konto niepodlaczone  -> { success: false, message: '...' }   (bez `error`)
 *   - awaria Camp Network  -> { success: false, error: '...' }
 *
 * Klient sklejal je jednym `data.error || data.message` i przez to kazdy brak
 * konta wygladal jak usterka. Te testy pilnuja rozroznienia, bo jest ono
 * niewidoczne na pierwszy rzut oka i ktos je kiedys "uprosci".
 */

describe('spotifyFailureKind', () => {
  it('sam `message` znaczy: konto nie jest podlaczone', () => {
    const payload = { success: false, message: 'No Spotify data found for this wallet address' };

    expect(spotifyFailureKind(payload)).to.equal('not-connected');
  });

  it('drugi ksztalt tej samej odmowy tez jest brakiem konta', () => {
    const payload = { success: false, message: 'No Spotify account connected for this wallet address' };

    expect(spotifyFailureKind(payload)).to.equal('not-connected');
  });

  it('`error` znaczy AWARIE - to jedyny przypadek, w ktorym ponawianie ma sens', () => {
    const payload = { success: false, error: 'Camp Network did not answer for this wallet.' };

    expect(spotifyFailureKind(payload)).to.equal('failed');
  });

  it('gdy przyjdzie i `error`, i `message`, wygrywa awaria', () => {
    const payload = { success: false, error: 'timeout', message: 'No Spotify data' };

    expect(spotifyFailureKind(payload)).to.equal('failed');
  });

  it('odpowiedz bez zadnego powodu traktujemy jak awarie, nie jak brak konta', () => {
    // Ciche "nie udalo sie" nie moze zamienic sie w "nie masz konta" - to
    // byloby zdanie o uzytkowniku, ktorego nie mamy prawa powiedziec.
    expect(spotifyFailureKind({ success: false })).to.equal('failed');
  });

  it('sukces nie jest zadna z tych rzeczy', () => {
    expect(spotifyFailureKind({ success: true, data: {} })).to.equal(null);
  });

  it('smieciowa odpowiedz nie wywraca wyboru', () => {
    expect(spotifyFailureKind(null)).to.equal('failed');
    expect(spotifyFailureKind('nonsens')).to.equal('failed');
  });
});
