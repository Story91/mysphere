export {};

const { expect } = require('chai');
const { liveWatchFor, PUBLIC_RPC_POLL_MS } = require('../app/startpad/config');

/**
 * TEMPO PODGLADU NA ZYWO.
 *
 * Obie subskrypcje startpada (tablica i strona tokena) mialy wpisane na sztywno
 * 8000 ms przy bloku Base co 2 s. Cudza transakcja pojawiala sie wiec srednio
 * po czterech sekundach, a w najgorszym razie po osmiu - i dotyczylo to naraz
 * tasmy, ceny, rezerwy, wykresu i listy transakcji.
 *
 * Osiem sekund bylo ustepstwem na rzecz PUBLICZNEGO RPC, ktory przy serii
 * odbija. Te testy pilnuja, ze ustepstwo obowiazuje tylko tam, gdzie jest
 * potrzebne, i ze przy WebSockecie nie narzucamy viemowi pollingu.
 */

describe('liveWatchFor', () => {
  it('publiczny RPC zostaje przy osmiu sekundach - jego limity sie nie zmienily', () => {
    expect(liveWatchFor({ secondsPerBlock: 2 })).to.deep.equal({ poll: true, pollingInterval: PUBLIC_RPC_POLL_MS });
  });

  it('wlasny endpoint pyta raz na blok, bo nie ma powodu czekac dluzej', () => {
    expect(liveWatchFor({ secondsPerBlock: 2, ownRpc: 'https://cdp.example/klucz' })).to.deep.equal({
      poll: true,
      pollingInterval: 2_000,
    });
  });

  it('pusta zmienna srodowiskowa jest brakiem endpointu, a nie endpointem', () => {
    expect(liveWatchFor({ secondsPerBlock: 2, ownRpc: '   ' }).pollingInterval).to.equal(PUBLIC_RPC_POLL_MS);
  });

  it('lancuch z blokiem ponizej sekundy nie schodzi ponizej sekundy', () => {
    // Robinhood robi blok co 0,1 s - pytanie dziesiec razy na sekunde byloby
    // atakiem na wlasny endpoint, a nie podgladem.
    expect(liveWatchFor({ secondsPerBlock: 0.1, ownRpc: 'https://own' }).pollingInterval).to.equal(1_000);
  });

  it('przy WebSockecie NIE narzucamy pollingu - decyzje zostawiamy viemowi', () => {
    // `undefined`, a nie `false`: gdyby konfiguracja WS byla, a transport nie,
    // wymuszona subskrypcja padlaby i podglad zamilklby bez sladu.
    expect(liveWatchFor({ secondsPerBlock: 2, wsRpc: 'wss://base.example' }).poll).to.equal(undefined);
  });

  it('WebSocket wygrywa z wlasnym HTTP, bo push bije kazde tempo pytania', () => {
    const tempo = liveWatchFor({ secondsPerBlock: 2, ownRpc: 'https://own', wsRpc: 'wss://base.example' });

    expect(tempo.poll).to.equal(undefined);
  });
});
