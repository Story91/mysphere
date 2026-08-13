export {};

const { expect } = require('chai');
const { suggestCoinFromPost } = require('../app/basechat/coinFromPost');

/**
 * PODPOWIEDZ TOKENA Z TRESCI POSTA.
 *
 * Zastepuje sciezke PostCoina, ktora skladala symbol z pierwszego slowa posta,
 * a nazwe z szablonu "MySphere Post by 0x1234...". Symbol zostaje - ludzie znaja
 * te regule z podpisu pod polem ("First letters of your post become the
 * $ticker"). Nazwa NIE: szablon z adresem autora nie mowi nic o tokenie i
 * wyladowalby na karcie, na tablicy i w token liscie.
 *
 * To jest PODPOWIEDZ, nie decyzja - autor widzi oba pola w kreatorze i moze je
 * nadpisac przed startem.
 */

describe('suggestCoinFromPost', () => {
  it('symbol powstaje z pierwszego slowa, wielkimi literami', () => {
    expect(suggestCoinFromPost('Genara is live').symbol).to.equal('GENARA');
  });

  it('znaki spoza liter i cyfr wypadaja z symbolu', () => {
    expect(suggestCoinFromPost('$sausages! rosnie').symbol).to.equal('SAUSAGES');
  });

  it('symbol jest przycinany - kontrakt i karta maja na niego jedna linijke', () => {
    expect(suggestCoinFromPost('absolutnieniewiarygodnydlugiwyraz').symbol).to.have.length.at.most(10);
  });

  it('nazwa bierze pierwsza linie tresci, nie szablon z adresem autora', () => {
    expect(suggestCoinFromPost('Genara Life\n\nopis nizej').name).to.equal('Genara Life');
  });

  it('dluga pierwsza linia jest przycinana', () => {
    const name = suggestCoinFromPost('a'.repeat(120)).name;

    expect(name).to.have.length.at.most(48);
  });

  it('pusty post oddaje puste pola, a nie wymyslone', () => {
    expect(suggestCoinFromPost('')).to.deep.equal({ symbol: '', name: '' });
    expect(suggestCoinFromPost('   ')).to.deep.equal({ symbol: '', name: '' });
  });

  it('post z samych znakow specjalnych nie daje symbolu z niczego', () => {
    expect(suggestCoinFromPost('!!! ???').symbol).to.equal('');
  });

  it('emoji nie trafia do symbolu, ale nie kasuje reszty slowa', () => {
    expect(suggestCoinFromPost('hot dogi').symbol).to.equal('HOT');
  });

  it('brak tresci (null) nie wywraca podpowiedzi', () => {
    expect(suggestCoinFromPost(null)).to.deep.equal({ symbol: '', name: '' });
  });
});
