export {};

// Czysta logika selektora sieci nad kompozytorem
// (app/components/GooeyNav/gooeyNavLogic.ts): wyglad aktywnego kafla
// i poruszanie sie klawiatura (roving tabindex, wybor dopiero Enter/Spacja).
const { expect } = require('chai');
const { activeTileStyle, rovingTarget, tabStopIndex } = require('../app/components/GooeyNav/gooeyNavLogic');

const key = (k: string, mods: Record<string, boolean> = {}) => ({ key: k, ...mods });

describe('GooeyNav: wyglad aktywnego kafla', () => {
  it('Base: biale tlo i ramka 2px we wlasnym kolorze (jak dotad)', () => {
    expect(activeTileStyle('base', '#0052FF')).to.deep.equal({
      background: 'white',
      borderColor: '#0052FF',
      borderWidth: '2px',
    });
  });

  it('World Chain: biale tlo i czarna ramka 1px (jak dotad)', () => {
    expect(activeTileStyle('world', '#9333EA')).to.deep.equal({
      background: 'white',
      borderColor: '#000000',
      borderWidth: '1px',
    });
  });

  it('sieci z gradientem zachowuja dotychczasowy gradient i ramke', () => {
    // #627EEA rozjasnione o 30% w strone bieli - ta sama formula co wczesniej.
    expect(activeTileStyle('ethereum', '#627EEA')).to.deep.equal({
      background: 'linear-gradient(135deg, rgb(98, 126, 234), rgb(145.1, 164.7, 240.3))',
      borderColor: '#ADD8E6',
      borderWidth: '1px',
    });
    expect(activeTileStyle('robinhood', '#00C805').borderColor).to.equal('#00C805');
    expect(activeTileStyle('linea', '#000000').borderColor).to.equal('#7FFFD4');
    expect(activeTileStyle('camp', '#FF6B35').borderColor).to.equal('#000000');
    expect(activeTileStyle('celo', '#FCFF52').borderColor).to.equal('#000000');
  });

  it('Arc: gradient i ramka 1px w kolorze transparent - bez zmian', () => {
    const s = activeTileStyle('arc', '#1E1E1E');
    expect(s.background).to.match(/^linear-gradient\(135deg, rgb\(30, 30, 30\)/);
    expect(s.borderColor).to.equal('transparent');
    expect(s.borderWidth).to.equal('1px');
  });

  it('siec bez specialStyle (Solana) dostaje biale tlo i ramke 2px we wlasnym kolorze, nie fioletowy gradient bez ramki', () => {
    expect(activeTileStyle(undefined, '#9945FF')).to.deep.equal({
      background: 'white',
      borderColor: '#9945FF',
      borderWidth: '2px',
    });
  });

  it('bez koloru i bez specialStyle - kolor zapasowy zamiast pustej ramki', () => {
    expect(activeTileStyle(undefined, undefined).borderColor).to.equal('#3b82f6');
  });
});

describe('GooeyNav: strzalki przenosza fokus, nie wybor', () => {
  it('prawo/lewo przechodza o jeden kafel i zawijaja na koncach', () => {
    expect(rovingTarget(key('ArrowRight'), 0, 9)).to.equal(1);
    expect(rovingTarget(key('ArrowRight'), 8, 9)).to.equal(0);
    expect(rovingTarget(key('ArrowLeft'), 0, 9)).to.equal(8);
    expect(rovingTarget(key('ArrowLeft'), 5, 9)).to.equal(4);
  });

  it('Home/End skacza na pierwszy i ostatni kafel', () => {
    expect(rovingTarget(key('Home'), 6, 9)).to.equal(0);
    expect(rovingTarget(key('End'), 2, 9)).to.equal(8);
    // Liczba kafli nie jest stala: bez Solany (miniapp Farcastera) jest ich 8.
    expect(rovingTarget(key('End'), 2, 8)).to.equal(7);
  });

  it('gora/dol, Enter, Spacja i Tab nie sa przechwytywane', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'a']) {
      expect(rovingTarget(key(k), 3, 9), k).to.equal(null);
    }
  });

  it('z Alt/Ctrl/Meta strzalka zostaje przegladarce', () => {
    expect(rovingTarget(key('ArrowRight', { altKey: true }), 0, 9)).to.equal(null);
    expect(rovingTarget(key('ArrowLeft', { ctrlKey: true }), 3, 9)).to.equal(null);
    expect(rovingTarget(key('Home', { metaKey: true }), 3, 9)).to.equal(null);
  });

  it('pusta lista - nic', () => {
    expect(rovingTarget(key('ArrowRight'), 0, 0)).to.equal(null);
  });
});

describe('GooeyNav: jeden przystanek Tab w rzedzie', () => {
  it('poza rzedem Tab wchodzi na wybrana siec', () => {
    expect(tabStopIndex(null, 4, 9)).to.equal(4);
  });

  it('w rzedzie przystankiem jest kafel z fokusem, nawet niewybrany', () => {
    expect(tabStopIndex(2, 4, 9)).to.equal(2);
  });

  it('bez wybranej sieci - pierwszy kafel', () => {
    expect(tabStopIndex(null, -1, 9)).to.equal(0);
  });

  it('indeks spoza skroconej listy jest ignorowany', () => {
    // Fokus stal na Solanie (8), a lista skurczyla sie do 8 pozycji.
    expect(tabStopIndex(8, 0, 8)).to.equal(0);
    expect(tabStopIndex(null, 8, 8)).to.equal(0);
  });

  it('pusta lista - brak przystanku', () => {
    expect(tabStopIndex(null, -1, 0)).to.equal(-1);
  });
});
