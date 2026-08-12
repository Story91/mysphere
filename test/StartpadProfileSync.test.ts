export {};

const { expect } = require('chai');
const {
  postProfileWithRetry,
  savePendingProfile,
  loadPendingProfiles,
  clearPendingProfile,
  flushPendingProfiles,
} = require('../app/startpad/profileSync');

/**
 * Dogrywanie profilu tokena (logo + opis) po starcie.
 *
 * Dotad byl jeden strzal fire-and-forget: 401 (brak sesji), 404 (wyscig z RPC)
 * albo `logoSaved: false` (czkawka Bloba) i logo zostawalo TYLKO w localStorage
 * tworcy - wszyscy inni widzieli pusty glif. Te testy przybijaja dwa filary
 * naprawy: ponawianie wysylki i trwala kolejke wpisow do dogrania.
 */

type Resp = { status: number; ok: boolean; logoSaved?: boolean };
const respond = (queue: Resp[]) => {
  let calls = 0;
  const send = async () => {
    calls += 1;
    const next = queue.shift();
    if (!next) throw new Error('network');
    return next;
  };
  return { send, calls: () => calls };
};
const noSleep = async () => {};

describe('postProfileWithRetry', () => {
  it('konczy sukcesem od razu, gdy serwer zapisal logo', async () => {
    const { send, calls } = respond([{ status: 200, ok: true, logoSaved: true }]);
    const outcome = await postProfileWithRetry(send, { expectLogo: true, sleep: noSleep });
    expect(outcome).to.equal('saved');
    expect(calls()).to.equal(1);
  });

  it('ponawia po 404 (wyscig z RPC) i konczy sukcesem', async () => {
    const { send, calls } = respond([
      { status: 404, ok: false },
      { status: 404, ok: false },
      { status: 200, ok: true, logoSaved: true },
    ]);
    const outcome = await postProfileWithRetry(send, { expectLogo: true, attempts: 4, sleep: noSleep });
    expect(outcome).to.equal('saved');
    expect(calls()).to.equal(3);
  });

  it('401 znaczy brak sesji - bez ponawiania, od razu needs_session', async () => {
    const { send, calls } = respond([{ status: 401, ok: false }]);
    const outcome = await postProfileWithRetry(send, { expectLogo: true, attempts: 4, sleep: noSleep });
    expect(outcome).to.equal('needs_session');
    expect(calls()).to.equal(1);
  });

  it('200 bez zapisanego logo to wciaz porazka do ponowienia (czkawka Bloba)', async () => {
    const { send, calls } = respond([
      { status: 200, ok: true, logoSaved: false },
      { status: 200, ok: true, logoSaved: true },
    ]);
    const outcome = await postProfileWithRetry(send, { expectLogo: true, attempts: 4, sleep: noSleep });
    expect(outcome).to.equal('saved');
    expect(calls()).to.equal(2);
  });

  it('bez logo w payloadzie logoSaved:false nie blokuje sukcesu', async () => {
    const { send, calls } = respond([{ status: 200, ok: true, logoSaved: false }]);
    const outcome = await postProfileWithRetry(send, { expectLogo: false, sleep: noSleep });
    expect(outcome).to.equal('saved');
    expect(calls()).to.equal(1);
  });

  it('wyjatek sieci liczy sie jak proba i po wyczerpaniu oddaje failed', async () => {
    const { send, calls } = respond([]);
    const outcome = await postProfileWithRetry(send, { expectLogo: true, attempts: 3, sleep: noSleep });
    expect(outcome).to.equal('failed');
    expect(calls()).to.equal(3);
  });

  it('czeka miedzy probami kolejnymi odstepami z delaysMs', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    const { send } = respond([]);
    await postProfileWithRetry(send, { expectLogo: true, attempts: 3, delaysMs: [4000, 10000], sleep });
    expect(waits).to.deep.equal([4000, 10000]);
  });
});

/** Pamiec przegladarki udawana w tescie - ten sam ksztalt co localStorage. */
function fakeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; dump(): Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
    dump: () => ({ ...data }),
  };
}

const ENTRY = {
  address: '0xB200000000000000000000ba5E093260f737Ff04',
  chainId: 8453,
  logoUrl: 'data:image/png;base64,AAAA',
  description: 'moon soon',
};

describe('kolejka oczekujacych profili', () => {
  it('zapisany wpis wraca z load po tej samej sieci', () => {
    const store = fakeStorage();
    savePendingProfile(store, { ...ENTRY, savedAt: 1000 });
    const pending = loadPendingProfiles(store, 8453, 2000);
    expect(pending).to.have.length(1);
    expect(pending[0].address).to.equal(ENTRY.address);
    expect(pending[0].logoUrl).to.equal(ENTRY.logoUrl);
  });

  it('wpis innej sieci nie wraca', () => {
    const store = fakeStorage();
    savePendingProfile(store, { ...ENTRY, savedAt: 1000 });
    expect(loadPendingProfiles(store, 84532, 2000)).to.have.length(0);
  });

  it('clear usuwa wpis po adresie bez wzgledu na wielkosc liter', () => {
    const store = fakeStorage();
    savePendingProfile(store, { ...ENTRY, savedAt: 1000 });
    clearPendingProfile(store, 8453, ENTRY.address.toUpperCase().replace('0X', '0x'));
    expect(loadPendingProfiles(store, 8453, 2000)).to.have.length(0);
  });

  it('drugi zapis pod tym samym adresem nadpisuje pierwszy', () => {
    const store = fakeStorage();
    savePendingProfile(store, { ...ENTRY, savedAt: 1000 });
    savePendingProfile(store, { ...ENTRY, description: 'nowszy opis', savedAt: 2000 });
    const pending = loadPendingProfiles(store, 8453, 3000);
    expect(pending).to.have.length(1);
    expect(pending[0].description).to.equal('nowszy opis');
  });

  it('wpisy starsze niz tydzien wypadaja przy odczycie', () => {
    const store = fakeStorage();
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    savePendingProfile(store, { ...ENTRY, savedAt: 1000 });
    expect(loadPendingProfiles(store, 8453, 1000 + WEEK + 1)).to.have.length(0);
  });

  it('zepsuty JSON w pamieci oddaje pusta kolejke zamiast rzucac', () => {
    const store = fakeStorage();
    store.setItem('startpad.pendingProfiles.8453', '{nie-json');
    expect(loadPendingProfiles(store, 8453, 2000)).to.have.length(0);
  });

  it('brak pamieci (null) niczego nie wywala', () => {
    expect(() => savePendingProfile(null, { ...ENTRY, savedAt: 1000 })).to.not.throw();
    expect(loadPendingProfiles(null, 8453, 2000)).to.have.length(0);
    expect(() => clearPendingProfile(null, 8453, ENTRY.address)).to.not.throw();
  });
});

describe('flushPendingProfiles', () => {
  const SECOND = { ...ENTRY, address: '0xB200000000000000000000ba5e9D437c77345c70' };

  it('dograny wpis znika z kolejki, niedograny zostaje', async () => {
    const store = fakeStorage();
    savePendingProfile(store, { ...ENTRY, savedAt: 1000 });
    savePendingProfile(store, { ...SECOND, savedAt: 1000 });
    const post = async (entry: { address: string }) =>
      entry.address === ENTRY.address ? 'saved' : 'failed';
    const result = await flushPendingProfiles(store, 8453, 2000, post);
    expect(result).to.deep.equal({ saved: 1, kept: 1 });
    const left = loadPendingProfiles(store, 8453, 2000);
    expect(left).to.have.length(1);
    expect(left[0].address).to.equal(SECOND.address);
  });

  it('brak sesji przerywa dogrywanie - reszta wpisow czeka na zalogowanie', async () => {
    const store = fakeStorage();
    savePendingProfile(store, { ...ENTRY, savedAt: 1000 });
    savePendingProfile(store, { ...SECOND, savedAt: 1000 });
    let posts = 0;
    const post = async () => {
      posts += 1;
      return 'needs_session';
    };
    const result = await flushPendingProfiles(store, 8453, 2000, post);
    expect(posts).to.equal(1);
    expect(result).to.deep.equal({ saved: 0, kept: 2 });
    expect(loadPendingProfiles(store, 8453, 2000)).to.have.length(2);
  });

  it('pusta kolejka nie wola serwera', async () => {
    const store = fakeStorage();
    let posts = 0;
    const post = async () => {
      posts += 1;
      return 'saved';
    };
    const result = await flushPendingProfiles(store, 8453, 2000, post);
    expect(posts).to.equal(0);
    expect(result).to.deep.equal({ saved: 0, kept: 0 });
  });
});
