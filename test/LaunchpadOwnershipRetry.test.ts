export {};

const { expect } = require('chai');
const { resolveCreatorWithRetry } = require('../app/api/launchpad/launchOwnership');

/**
 * Odczyt wlasnosci tokena tuz po starcie - wyscig z publicznym RPC.
 *
 * `launchOf` wolane sekunde po wykopaniu bloku potrafi oddac state 0 ("nie znam
 * tego tokena"), bo publiczny RPC oddaje nieswieze odczyty tuz po zapisie.
 * Route traktowal to jako 404 i logo przepadalo NA ZAWSZE (klient strzela raz).
 * Retry z odstepem rozwiazuje wyscig: po 2-4 s kazdy node juz widzi token.
 */

const CREATOR = '0x9Dde9b991753aeFf62F5D869e873102861CFb5Cd';
const noSleep = async () => {};

describe('resolveCreatorWithRetry', () => {
  it('oddaje tworce od razu, gdy pierwszy odczyt zna token', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { creator: CREATOR, state: 1 };
    };
    const result = await resolveCreatorWithRetry(read, { sleep: noSleep });
    expect(result).to.deep.equal({ ok: true, creator: CREATOR });
    expect(reads).to.equal(1);
  });

  it('ponawia odczyt, gdy state 0 to nieswiezy RPC, i konczy sukcesem', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      if (reads < 3) return { creator: '0x0000000000000000000000000000000000000000', state: 0 };
      return { creator: CREATOR, state: 1 };
    };
    const result = await resolveCreatorWithRetry(read, { attempts: 3, sleep: noSleep });
    expect(result).to.deep.equal({ ok: true, creator: CREATOR });
    expect(reads).to.equal(3);
  });

  it('po wyczerpaniu prob ze state 0 oddaje unknown_token', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { creator: '0x0000000000000000000000000000000000000000', state: 0 };
    };
    const result = await resolveCreatorWithRetry(read, { attempts: 3, sleep: noSleep });
    expect(result).to.deep.equal({ ok: false, reason: 'unknown_token' });
    expect(reads).to.equal(3);
  });

  it('ponawia takze rzucajacy odczyt i po wyczerpaniu oddaje chain_unavailable', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      throw new Error('rpc down');
    };
    const result = await resolveCreatorWithRetry(read, { attempts: 3, sleep: noSleep });
    expect(result).to.deep.equal({ ok: false, reason: 'chain_unavailable' });
    expect(reads).to.equal(3);
  });

  it('wyjatek, po ktorym state 0 wyczerpal proby, zglasza unknown_token (ostatni wynik decyduje)', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      if (reads === 1) throw new Error('rpc down');
      return { creator: '0x0000000000000000000000000000000000000000', state: 0 };
    };
    const result = await resolveCreatorWithRetry(read, { attempts: 2, sleep: noSleep });
    expect(result).to.deep.equal({ ok: false, reason: 'unknown_token' });
    expect(reads).to.equal(2);
  });

  it('czeka miedzy probami zadanym sleep', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); };
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { creator: '0x0000000000000000000000000000000000000000', state: 0 };
    };
    await resolveCreatorWithRetry(read, { attempts: 3, delayMs: 2000, sleep });
    // Odstep miedzy probami, nie po ostatniej - stad attempts-1 czekan.
    expect(waits).to.deep.equal([2000, 2000]);
  });
});
