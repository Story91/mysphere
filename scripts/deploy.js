const hre = require("hardhat");

async function main() {
  const MySphereAIQuotes = await hre.ethers.getContractFactory("MySphereAIQuotes");
  const quotes = await MySphereAIQuotes.deploy();

  await quotes.waitForDeployment();

  const address = await quotes.getAddress();
  console.log("MySphereAIQuotes deployed to:", address);
  
  // Czekamy na potwierdzenie bloków dla lepszej weryfikacji
  await quotes.deploymentTransaction().wait(5);
  
  // Weryfikacja kontraktu
  console.log("Rozpoczynam weryfikację kontraktu...");
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: [],
    });
    console.log("Kontrakt zweryfikowany pomyślnie!");
  } catch (error) {
    console.log("Błąd weryfikacji:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 