export {};

const { expect } = require('chai');
const { shareIntentUrl, buildShareUrl, composeParam } = require('../app/startpad/shareText');

/**
 * Udostepnianie tokena startpada NA FEED MySphere.
 *
 * Dotad menu udostepniania mialo X, Farcastera, Telegrama, WhatsAppa,
 * Facebooka i Reddita - czyli wszystko oprocz wlasnego feedu. A feed jest
 * jedynym kanalem, w ktorym post zostaje u nas i wraca ruchem na startpad.
 *
 * Druga rzecz, ktora te testy przybijaja: LINK MUSI PROWADZIC NA STARTPAD.
 * Mechanizm `?share=` w basechacie sklada dzis adres `mysphere.fun/b20/<adres>`
 * i to jest ta sama pomylka, ktora widac na karcie tokena pod postem - token z
 * krzywej startpada opisany strona b20, ktora nie zna ani jego ceny, ani logo.
 */

const TOKEN = '0xB200000000000000000000ba5e9D437c77345c70';
const readCompose = (url: string) => decodeURIComponent(url.split('compose=')[1]);

describe('composeParam', () => {
  it('sklada adres kompozytora feedu z gotowa trescia', () => {
    const url = composeParam('$SAUSAGES x1.50 since launch', 'https://mysphere.fun/startpad/0xabc');

    expect(url).to.match(/^\/basechat\?compose=/);
    const text = readCompose(url);
    expect(text).to.contain('$SAUSAGES');
    expect(text).to.contain('https://mysphere.fun/startpad/0xabc');
  });

  it('nowa linia zostaje - ona oddziela tresc od linku', () => {
    expect(readCompose(composeParam('zdanie', 'https://mysphere.fun/x'))).to.equal('zdanie\n\nhttps://mysphere.fun/x');
  });

  it('wycina znaki sterujace, ktore i tak nie sa trescia posta', () => {
    const brzydki = `zda${String.fromCharCode(7)}nie${String.fromCharCode(27)}`;

    expect(readCompose(composeParam(brzydki, 'https://mysphere.fun/x'))).to.equal('zdanie\n\nhttps://mysphere.fun/x');
  });

  it('tnie przydluga tresc - pole kompozytora to nie jest kanal na eseje', () => {
    const text = readCompose(composeParam('a'.repeat(2000), 'https://mysphere.fun/startpad/0xabc'));

    expect(text.length).to.be.at.most(600);
  });
});

describe('shareIntentUrl dla feedu MySphere', () => {
  it('prowadzi do wlasnego kompozytora, a nie do obcego serwisu', () => {
    const url = shareIntentUrl('mysphere', { text: '$SAUSAGES', url: 'https://mysphere.fun/startpad/0xabc' });

    expect(url).to.match(/^\/basechat\?compose=/);
    expect(url).to.not.contain('x.com');
  });

  it('niesie link do STARTPADA, nie do strony b20', () => {
    const tokenUrl = buildShareUrl({ address: TOKEN, chainId: 8453 });
    const text = readCompose(shareIntentUrl('mysphere', { text: '$SAUSAGES', url: tokenUrl }));

    expect(text).to.contain('/startpad/');
    expect(text).to.not.contain('/b20/');
  });

  it('pozostale kanaly dzialaja jak dotad', () => {
    expect(shareIntentUrl('x', { text: 'a', url: 'https://b' })).to.contain('x.com/intent/tweet');
    expect(shareIntentUrl('telegram', { text: 'a', url: 'https://b' })).to.contain('t.me/share');
  });
});
