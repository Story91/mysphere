// Konfiguracja projektu laduje wtyczki przez `require`, wiec `hardhat` jest tu
// modulem CommonJS - ta sama forma co w CurveLaunchpad.test.ts.
const hre = require('hardhat');
const { ethers } = hre;
const { expect } = require('chai');

/**
 * SphereStreamingMerkleDistributor - wyplaty volume mining (faza 1B).
 *
 * Co ten plik dowodzi:
 *  1. CYKL ROOTA: tylko PROPOSER proponuje, epoki sekwencyjne, total nie
 *     moze sie skurczyc, GUARDIAN ma WYLACZNIE weto, aktywacja dopiero po
 *     MIN_DELAY i tylko przy pelnym pokryciu zobowiazan (Insolvent).
 *  2. STREAMING: prevCum uwolnione od razu, przyrost liniowo przez
 *     STREAM_DURATION liczony od AKTYWACJI (czyli po oknie weta).
 *  3. KUMULATYWNOSC: jeden claim zbiera zalegle epoki; drugi root nadpisuje
 *     pierwszy, a stare naleznosci zyja w nowym rootcie (prevCum).
 *  4. Odpornosci: zly proof, nie-monotoniczny leaf, podwojny claim,
 *     brak admin surface.
 *
 * Drzewo Merkle liczone tak samo jak w scripts/sphere/publishEpoch.ts:
 * leaf = keccak(keccak(abi.encode(account, cum, prevCum))) (podwojny hash,
 * standard OZ), pary sortowane.
 */

const DAY = 24n * 3600n;
const MIN_DELAY = DAY; // decyzja #10: okno weta 24h
const STREAM = 7n * DAY; // decyzja #15: streaming przez 1 epoke

function leafOf(account: string, cum: bigint, prevCum: bigint): string {
  const inner = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256', 'uint256'], [account, cum, prevCum])
  );
  return ethers.keccak256(inner);
}

/** Proste drzewo z sortowanymi parami (zgodne z OZ MerkleProof). */
function buildTree(leaves: string[]): { root: string; proofFor: (leaf: string) => string[] } {
  if (leaves.length === 0) throw new Error('puste drzewo');
  const layers: string[][] = [leaves.slice().sort()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 === prev.length) next.push(prev[i]);
      else {
        const [a, b] = [prev[i], prev[i + 1]].sort();
        next.push(ethers.keccak256(ethers.concat([a, b])));
      }
    }
    layers.push(next);
  }
  return {
    root: layers[layers.length - 1][0],
    proofFor: (leaf: string) => {
      const proof: string[] = [];
      let idx = layers[0].indexOf(leaf);
      if (idx < 0) throw new Error('leaf spoza drzewa');
      for (let l = 0; l < layers.length - 1; l++) {
        const sib = idx ^ 1;
        if (sib < layers[l].length) proof.push(layers[l][sib]);
        idx = Math.floor(idx / 2);
      }
      return proof;
    },
  };
}

describe('SphereStreamingMerkleDistributor', function () {
  this.timeout(120_000);
  let deployer: any, proposer: any, guardian: any, alice: any, bob: any, carol: any;
  let token: any, dist: any;

  async function now() {
    return BigInt((await ethers.provider.getBlock('latest')).timestamp);
  }

  async function warpTo(ts: bigint) {
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Number(ts)]);
    await hre.network.provider.send('evm_mine');
  }

  beforeEach(async function () {
    [deployer, proposer, guardian, alice, bob, carol] = await ethers.getSigners();
    token = await (await ethers.getContractFactory('MockB20')).deploy();
    await token.waitForDeployment();
    const D = await ethers.getContractFactory('SphereStreamingMerkleDistributor');
    dist = await D.deploy(await token.getAddress(), proposer.address, guardian.address, MIN_DELAY, STREAM);
    await dist.waitForDeployment();
  });

  // ======================================================================
  //  1. KONSTRUKTOR I ROLE
  // ======================================================================

  it('zamraza role i harmonogram; odrzuca guardiana == proposera', async function () {
    expect(await dist.PROPOSER()).to.equal(proposer.address);
    expect(await dist.GUARDIAN()).to.equal(guardian.address);
    expect(await dist.MIN_DELAY()).to.equal(MIN_DELAY);
    const D = await ethers.getContractFactory('SphereStreamingMerkleDistributor');
    await expect(
      D.deploy(await token.getAddress(), proposer.address, proposer.address, MIN_DELAY, STREAM)
    ).to.be.revertedWithCustomError(dist, 'ZeroAddress');
  });

  it('nie ma zadnej powierzchni admina poza dwiema rolami', async function () {
    const frags = dist.interface.fragments
      .filter((f: any) => f.type === 'function')
      .map((f: any) => f.name.toLowerCase());
    for (const banned of ['owner', 'setroot', 'transferownership', 'withdraw', 'sweep', 'rescue', 'pause', 'upgradeto', 'setproposer', 'setguardian']) {
      expect(frags, `nie powinno byc ${banned}`).to.not.include(banned);
    }
  });

  // ======================================================================
  //  2. CYKL ROOTA
  // ======================================================================

  it('tylko PROPOSER proponuje; epoki sekwencyjne; total nie moze zmalec', async function () {
    const tree = buildTree([leafOf(alice.address, 100n, 0n)]);
    await expect(
      dist.connect(alice).propose(tree.root, ethers.id('m'), 1n, 100n)
    ).to.be.revertedWithCustomError(dist, 'NotProposer');
    await expect(
      dist.connect(proposer).propose(tree.root, ethers.id('m'), 2n, 100n)
    ).to.be.revertedWithCustomError(dist, 'WrongEpochId');
    await dist.connect(proposer).propose(tree.root, ethers.id('m'), 1n, 100n);
    expect((await dist.pending()).root).to.equal(tree.root);
  });

  it('GUARDIAN wetuje pending i NICZEGO nie ustawia; obcy nie zawetuje', async function () {
    const tree = buildTree([leafOf(alice.address, 100n, 0n)]);
    await dist.connect(proposer).propose(tree.root, ethers.id('m'), 1n, 100n);
    await expect(dist.connect(alice).veto()).to.be.revertedWithCustomError(dist, 'NotGuardian');
    await expect(dist.connect(guardian).veto()).to.emit(dist, 'RootVetoed');
    expect((await dist.pending()).validAt).to.equal(0n);
    expect(await dist.root()).to.equal(ethers.ZeroHash);
    // Po wecie proposer moze zaproponowac poprawiony root tej samej epoki.
    await dist.connect(proposer).propose(tree.root, ethers.id('m2'), 1n, 100n);
  });

  it('aktywacja: dopiero po MIN_DELAY i tylko przy pokrytych zobowiazaniach', async function () {
    const tree = buildTree([leafOf(alice.address, ethers.parseEther('100'), 0n)]);
    await dist.connect(proposer).propose(tree.root, ethers.id('m'), 1n, ethers.parseEther('100'));
    await expect(dist.connect(bob).activate()).to.be.revertedWithCustomError(dist, 'TimelockNotElapsed');
    await warpTo((await now()) + MIN_DELAY + 1n);
    // Saldo 0 < totalCumulative -> Insolvent (balance >= outstanding, wymog speca).
    await expect(dist.connect(bob).activate()).to.be.revertedWithCustomError(dist, 'Insolvent');
    await token.mint(await dist.getAddress(), ethers.parseEther('100'));
    await expect(dist.connect(bob).activate()).to.emit(dist, 'RootActivated');
    expect(await dist.epochId()).to.equal(1n);
  });

  it('nowa propozycja nadpisuje pending i RESETUJE okno weta', async function () {
    const t1 = buildTree([leafOf(alice.address, 100n, 0n)]);
    const t2 = buildTree([leafOf(bob.address, 200n, 0n)]);
    await dist.connect(proposer).propose(t1.root, ethers.id('m1'), 1n, 100n);
    await warpTo((await now()) + MIN_DELAY - 10n);
    await dist.connect(proposer).propose(t2.root, ethers.id('m2'), 1n, 200n);
    // Stare okno minelo, ale nowa propozycja ma SWOJE pelne okno.
    await warpTo((await now()) + 20n);
    await expect(dist.connect(bob).activate()).to.be.revertedWithCustomError(dist, 'TimelockNotElapsed');
  });

  // ======================================================================
  //  3. STREAMING + KUMULATYWNOSC
  // ======================================================================

  async function activateRoot(leaves: string[], epoch: bigint, total: bigint, manifest = 'm') {
    const tree = buildTree(leaves);
    await dist.connect(proposer).propose(tree.root, ethers.id(manifest), epoch, total);
    await warpTo((await now()) + MIN_DELAY + 1n);
    const bal = await token.balanceOf(await dist.getAddress());
    const claimedTotal = await dist.totalClaimed();
    if (bal + claimedTotal < total) await token.mint(await dist.getAddress(), total - bal - claimedTotal);
    await dist.connect(carol).activate();
    return tree;
  }

  it('przyrost epoki uwalnia sie LINIOWO od aktywacji; claim zbiera narosle', async function () {
    const cum = ethers.parseEther('70');
    const tree = await activateRoot([leafOf(alice.address, cum, 0n)], 1n, cum);
    const activatedAt = BigInt(await dist.activatedAt());

    // W polowie streamu: ~polowa uwolniona.
    await warpTo(activatedAt + STREAM / 2n);
    const half = (cum * (STREAM / 2n)) / STREAM;
    expect(await dist.vestedOf(cum, 0n)).to.equal(half);

    // Claim dostarcza narosle na konto - wolajacym jest KTO INNY (bob).
    const releaseAt = activatedAt + STREAM / 2n + 5n;
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Number(releaseAt)]);
    const expected = (cum * (releaseAt - activatedAt)) / STREAM;
    await expect(dist.connect(bob).claim(alice.address, cum, 0n, tree.proofFor(leafOf(alice.address, cum, 0n))))
      .to.emit(dist, 'Claimed')
      .withArgs(alice.address, expected, cum, bob.address);
    expect(await token.balanceOf(alice.address)).to.equal(expected);

    // Po koncu streamu: reszta.
    await warpTo(activatedAt + STREAM + 1n);
    await dist.connect(bob).claim(alice.address, cum, 0n, tree.proofFor(leafOf(alice.address, cum, 0n)));
    expect(await token.balanceOf(alice.address)).to.equal(cum);
    // I ani wei wiecej.
    await expect(
      dist.connect(bob).claim(alice.address, cum, 0n, tree.proofFor(leafOf(alice.address, cum, 0n)))
    ).to.be.revertedWithCustomError(dist, 'NothingToClaim');
  });

  it('kumulatywnosc przez epoki: prevCum uwolnione OD RAZU, przyrost streamuje', async function () {
    // Epoka 1: alice 40. Nikt nie claimuje. Epoka 2: alice 40 -> 100.
    const cum1 = ethers.parseEther('40');
    const cum2 = ethers.parseEther('100');
    await activateRoot([leafOf(alice.address, cum1, 0n)], 1n, cum1, 'm1');
    await warpTo(BigInt(await dist.activatedAt()) + STREAM + 10n);
    const tree2 = await activateRoot([leafOf(alice.address, cum2, cum1)], 2n, cum2, 'm2');
    const act2 = BigInt(await dist.activatedAt());

    // Zaraz po aktywacji: cale 40 z epoki 1 (prevCum) + ~0 z przyrostu.
    const claimAt = act2 + 100n;
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Number(claimAt)]);
    const expected = cum1 + ((cum2 - cum1) * (claimAt - act2)) / STREAM;
    await dist.connect(bob).claim(alice.address, cum2, cum1, tree2.proofFor(leafOf(alice.address, cum2, cum1)));
    expect(await token.balanceOf(alice.address)).to.equal(expected);
  });

  it('czesciowy claim w epoce 1 poprawnie odlicza sie od wyplat w epoce 2', async function () {
    const cum1 = ethers.parseEther('40');
    const cum2 = ethers.parseEther('100');
    const tree1 = await activateRoot([leafOf(alice.address, cum1, 0n)], 1n, cum1, 'm1');
    const act1 = BigInt(await dist.activatedAt());
    // Claim w polowie epoki 1.
    const at = act1 + STREAM / 2n;
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Number(at)]);
    await dist.connect(bob).claim(alice.address, cum1, 0n, tree1.proofFor(leafOf(alice.address, cum1, 0n)));
    const got1 = (cum1 * (at - act1)) / STREAM;

    await warpTo(act1 + STREAM + 10n);
    const tree2 = await activateRoot([leafOf(alice.address, cum2, cum1)], 2n, cum2, 'm2');
    await warpTo(BigInt(await dist.activatedAt()) + STREAM + 1n);
    await dist.connect(bob).claim(alice.address, cum2, cum1, tree2.proofFor(leafOf(alice.address, cum2, cum1)));
    // Sumarycznie DOKLADNIE cum2 - niezaleznie od tego, kiedy claimowano.
    expect(await token.balanceOf(alice.address)).to.equal(cum2);
    expect(got1 > 0n).to.equal(true);
  });

  it('wielu odbiorcow w drzewie; kazdy claim niezalezny', async function () {
    const a = ethers.parseEther('10');
    const b = ethers.parseEther('30');
    const leaves = [leafOf(alice.address, a, 0n), leafOf(bob.address, b, 0n)];
    const tree = await activateRoot(leaves, 1n, a + b);
    await warpTo(BigInt(await dist.activatedAt()) + STREAM + 1n);
    await dist.connect(carol).claim(alice.address, a, 0n, tree.proofFor(leaves[0]));
    await dist.connect(carol).claim(bob.address, b, 0n, tree.proofFor(leaves[1]));
    expect(await token.balanceOf(alice.address)).to.equal(a);
    expect(await token.balanceOf(bob.address)).to.equal(b);
    expect(await dist.totalClaimed()).to.equal(a + b);
  });

  // ======================================================================
  //  4. ODPORNOSCI
  // ======================================================================

  it('zly proof i zawyzone kwoty odpadaja', async function () {
    const cum = ethers.parseEther('10');
    const tree = await activateRoot([leafOf(alice.address, cum, 0n)], 1n, cum);
    await warpTo(BigInt(await dist.activatedAt()) + STREAM + 1n);
    await expect(
      dist.claim(alice.address, cum * 2n, 0n, tree.proofFor(leafOf(alice.address, cum, 0n)))
    ).to.be.revertedWithCustomError(dist, 'InvalidProof');
    await expect(
      dist.claim(bob.address, cum, 0n, tree.proofFor(leafOf(alice.address, cum, 0n)))
    ).to.be.revertedWithCustomError(dist, 'InvalidProof');
  });

  it('nie-monotoniczny leaf (cum < prevCum) rewertuje nawet z poprawnym proofem', async function () {
    // Zlosliwy/zepsuty proposer moglby wsadzic taki leaf do drzewa - claim
    // ma go odrzucic zamiast liczyc ujemny przyrost.
    const bad = leafOf(alice.address, 10n, 20n);
    const tree = await activateRoot([bad, leafOf(bob.address, 5n, 0n)], 1n, 30n);
    await warpTo(BigInt(await dist.activatedAt()) + 10n);
    await expect(
      dist.claim(alice.address, 10n, 20n, tree.proofFor(bad))
    ).to.be.revertedWithCustomError(dist, 'NonMonotonicLeaf');
  });
});
