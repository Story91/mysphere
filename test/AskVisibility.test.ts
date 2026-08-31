export {};

const { expect } = require('chai');
const { sealedAnswerNotice, authorIdentityMismatch } = require('../app/utils/asks/visibility');

/**
 * Komunikat przy zapieczetowanej odpowiedzi musi mowic, DLACZEGO nie widac.
 *
 * Dotad kazdy widz dostawal to samo "Sealed. It exists" - tworca, ktory wszedl
 * z innego portfela, nie mial zadnej wskazowki, ze patrzy z niewlasciwej
 * tozsamosci. Te testy przybijaja: inne zdanie dla niezalogowanego, inne dla
 * zalogowanego nie-tworcy (z oboma adresami), i wykrycie rozjazdu portfel/sesja.
 */

const AUTHOR = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const OTHER = '0xDf1e757062D7E6ef19BAb6D6B1aa6f9fA44a09Eb';

describe('sealedAnswerNotice', () => {
  it('niezalogowany dostaje wskazowke o zalogowaniu', () => {
    const notice = sealedAnswerNotice({
      signedIn: false,
      sessionAddress: null,
      walletAddress: null,
      askAuthor: AUTHOR,
    });
    expect(notice).to.include('sign in');
    expect(notice).to.not.include('you are signed in as');
  });

  it('zalogowany nie-tworca widzi kto moze czytac i jako kto sam patrzy', () => {
    const notice = sealedAnswerNotice({
      signedIn: true,
      sessionAddress: OTHER,
      walletAddress: OTHER,
      askAuthor: AUTHOR,
    });
    // Oba adresy skrocone: poczatek autora i poczatek patrzacego.
    expect(notice).to.include('0xD488');
    expect(notice).to.include('0xDf1e');
    expect(notice.toLowerCase()).to.include('author');
  });

  it('zaden komunikat nie zawiera dlugiego myslnika', () => {
    const variants = [
      sealedAnswerNotice({ signedIn: false, sessionAddress: null, walletAddress: null, askAuthor: AUTHOR }),
      sealedAnswerNotice({ signedIn: true, sessionAddress: OTHER, walletAddress: OTHER, askAuthor: AUTHOR }),
      sealedAnswerNotice({ signedIn: true, sessionAddress: AUTHOR, walletAddress: AUTHOR, askAuthor: AUTHOR }),
    ];
    for (const text of variants) {
      expect(text).to.not.match(/[—–]/);
    }
  });
});

describe('authorIdentityMismatch', () => {
  it('portfel tworcy podlaczony, sesja innego adresu = rozjazd', () => {
    expect(
      authorIdentityMismatch({
        signedIn: true,
        sessionAddress: OTHER,
        walletAddress: AUTHOR,
        askAuthor: AUTHOR,
      })
    ).to.equal(true);
  });

  it('portfel i sesja tworcy = brak rozjazdu', () => {
    expect(
      authorIdentityMismatch({
        signedIn: true,
        sessionAddress: AUTHOR.toLowerCase(),
        walletAddress: AUTHOR,
        askAuthor: AUTHOR,
      })
    ).to.equal(false);
  });

  it('obcy portfel bez zwiazku z askiem = brak rozjazdu', () => {
    expect(
      authorIdentityMismatch({
        signedIn: true,
        sessionAddress: OTHER,
        walletAddress: OTHER,
        askAuthor: AUTHOR,
      })
    ).to.equal(false);
  });

  it('brak sesji = brak rozjazdu (to przypadek dla banera zaloguj sie)', () => {
    expect(
      authorIdentityMismatch({
        signedIn: false,
        sessionAddress: null,
        walletAddress: AUTHOR,
        askAuthor: AUTHOR,
      })
    ).to.equal(false);
  });

  it('wielkosc liter adresow nie ma znaczenia', () => {
    expect(
      authorIdentityMismatch({
        signedIn: true,
        sessionAddress: OTHER.toUpperCase().replace('0X', '0x'),
        walletAddress: AUTHOR.toLowerCase(),
        askAuthor: AUTHOR,
      })
    ).to.equal(true);
  });
});
