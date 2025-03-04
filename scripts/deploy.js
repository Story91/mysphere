const hre = require("hardhat");

async function main() {
  const platformAddress = process.env.PLATFORM_ADDRESS || "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd";
  
  console.log("Deploying contracts with platform address:", platformAddress);

  const PostCoinFactory = await hre.ethers.getContractFactory("PostCoinFactory");
  const factory = await PostCoinFactory.deploy(platformAddress);
  
  await factory.waitForDeployment();
  
  const address = await factory.getAddress();
  console.log("PostCoinFactory deployed to:", address);

  // Weryfikacja kontraktu
  console.log("Waiting for deployment confirmation...");
  await factory.deploymentTransaction().wait(5);
  
  console.log("Verifying contract...");
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: [platformAddress],
    });
    console.log("Contract verified successfully!");
  } catch (error) {
    console.error("Verification error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });