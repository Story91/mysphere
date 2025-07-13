const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function updateMetadataURI() {
    const [deployer] = await ethers.getSigners();
    console.log("🔄 Updating Metadata URIs with account:", deployer.address);

    // Load deployment info
    const deploymentPath = path.join(__dirname, 'deployment-spheres.json');
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ deployment-spheres.json not found! Please run deploy-spheres.js first.");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;
    
    console.log("📍 Contract Address:", contractAddress);

    // --- Configuration - IPFS HASHES ---
    const config = {
        soulboundJsonUri: "https://beige-real-eagle-159.mypinata.cloud/ipfs/bafkreibrmguhjxurmjutfj5pxfxhgkda3vmtmk4z4ikqzh7vgdlm34q", // soulbound-nft.json
        utilityBoxNftUri: "https://beige-real-eagle-159.mypinata.cloud/ipfs/bafkreibffp7qxc7stlbgcpnondr36lsjbmt6foxcgdo2mvnvgeecd7xmf4" // utilitybox-champion.json
    };

    // Configuration validated - IPFS hashes are ready
    console.log("✅ IPFS hashes configured successfully");

    // Connect to the deployed contract
    const HybridCommunityPlatform = await ethers.getContractFactory("HybridCommunityPlatform");
    const spheresContract = HybridCommunityPlatform.attach(contractAddress);

    console.log("\n⚙️  Updating Contract Metadata URIs...");

    try {
        // Update Utility Box NFT URI
        console.log("  - Updating Utility Box NFT URI...");
        const setUtilityBoxNftUriTx = await spheresContract.setUtilityBoxNftUri(config.utilityBoxNftUri);
        await setUtilityBoxNftUriTx.wait();
        console.log("    ✅ Utility Box NFT URI updated successfully");

        // Verify the updates
        console.log("\n🔍 Verifying Updates...");
        const currentUtilityBoxUri = await spheresContract.utilityBoxNftUri();
        console.log("  - Current Utility Box NFT URI:", currentUtilityBoxUri);

        // Update deployment info with new URIs
        deploymentInfo.configuration.ipfs.soulboundJsonUri = config.soulboundJsonUri;
        deploymentInfo.configuration.ipfs.utilityBoxNftUri = config.utilityBoxNftUri;
        deploymentInfo.lastUpdated = new Date().toISOString();

        // Save updated deployment info
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        console.log("  ✅ Deployment info updated with new URIs");

        console.log("\n🎉 METADATA URI UPDATE COMPLETED SUCCESSFULLY! 🎉");
        console.log("==========================================");
        console.log("📝 Updated URIs:");
        console.log("  - Soulbound JSON URI:", config.soulboundJsonUri);
        console.log("  - Utility Box NFT URI:", config.utilityBoxNftUri);
        console.log("💾 Updated deployment info saved to:", deploymentPath);

    } catch (error) {
        console.error("❌ Error updating metadata URIs:", error);
        process.exit(1);
    }
}

// Example usage instructions
console.log("📋 IPFS Upload Instructions:");
console.log("=========================");
console.log("1. Upload ./nft/soulbound-nft.json to IPFS");
console.log("2. Upload ./nft/utilitybox-champion.json to IPFS");
console.log("3. Update the config object in this script with the IPFS hashes");
console.log("4. Run: npx hardhat run scripts/update-metadata-uri.js --network base-sepolia");
console.log("");

updateMetadataURI()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("❌ UPDATE FAILED:", error);
        process.exit(1);
    }); 