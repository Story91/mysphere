import { expect } from "chai";
import { keccak256 } from "ethers";
import { resolvePoolManager } from "../scripts/launchpad/plan";
import { verifyPoolManagerCode } from "../scripts/launchpad/verifyPoolManager";

describe("Launchpad deployment dependencies", function () {
  const code = "0x60006000";
  let originalManager: string | undefined;
  beforeEach(function () {
    originalManager = process.env.POOL_MANAGER;
    delete process.env.POOL_MANAGER;
  });
  afterEach(function () {
    if (originalManager === undefined) delete process.env.POOL_MANAGER;
    else process.env.POOL_MANAGER = originalManager;
  });

  it("refuses an implicit Arc mainnet PoolManager", function () {
    expect(() => resolvePoolManager(5042)).to.throw("POOL_MANAGER");
  });
  it("preserves Base and Arc testnet defaults", function () {
    expect(resolvePoolManager(8453).address.toLowerCase()).to.equal("0x498581ff718922c3f8e6a244956af099b2652b2b");
    expect(resolvePoolManager(5042002).address.toLowerCase()).to.equal("0xd02a166a186bcc5c537fecd5103e9c1a94bb49d6");
  });
  it("accepts an explicit address without labeling it canonical", function () {
    process.env.POOL_MANAGER = "0x1111111111111111111111111111111111111111";
    expect(resolvePoolManager(5042).source).to.equal("POOL_MANAGER (env)");
  });
  it("requires an Arc runtime hash, not merely nonempty code", function () {
    expect(() => verifyPoolManagerCode(5042, code, "")).to.throw("requires POOL_MANAGER_CODE_HASH");
  });
  it("rejects empty runtime even when its hash matches", function () {
    expect(() => verifyPoolManagerCode(5042, "0x", keccak256("0x"))).to.throw("no valid runtime");
  });
  it("rejects a different deployed runtime", function () {
    expect(() => verifyPoolManagerCode(5042, code, keccak256("0x6001"))).to.throw("runtime changed");
  });
  it("rejects a malformed hash", function () {
    expect(() => verifyPoolManagerCode(5042, code, "0x1234")).to.throw("32-byte");
  });
  it("accepts the pinned runtime", function () {
    expect(verifyPoolManagerCode(5042, code, keccak256(code))).to.equal(keccak256(code));
  });
  it("preserves other chains without an optional pin", function () {
    expect(verifyPoolManagerCode(8453, code, "")).to.equal(keccak256(code));
  });
});
