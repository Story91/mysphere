const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function deploySpheresCore() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying Spheres Core (HybridCommunityPlatform) with account:", deployer.address);
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");

    // --- Configuration ---
    const config = {
        ipfs: {
            utilityBoxNftUri: "https://beige-real-eagle-159.mypinata.cloud/ipfs/bafkreibffp7qxc7stlbgcpnondr36lsjbmt6foxcgdo2mvnvgeecd7xmf4"
        },
        fees: {
            creationFeeEth: ethers.parseEther("0.01"),
            minMysteryBoxBet: ethers.parseEther("0.00035"),
            maxMysteryBoxBet: ethers.parseEther("0.01"),
            utilityBoxFee: ethers.parseEther("0.0001"),
            achievementUnlockFee: ethers.parseEther("0.0005"),
            boostPurchaseFee: ethers.parseEther("0.0005"),
            eventPlatformFee: ethers.parseEther("0.002")
        },
        platform: {
            defaultPlatformFeePercentage: 25, // 2.5%
            maxPlatformFeePercentage: 100, // 10%
            withdrawalFeePercentage: 10, // 1%
            transactionFeePercentage: 5 // 0.5%
        }
    };

    console.log("\n📋 Using Deployment Configuration:");
    console.log("  - Optimizer runs: 50 (optimized for deployment size)");
    console.log("  - Creation Fee:", ethers.formatEther(config.fees.creationFeeEth), "ETH");
    console.log("  - Utility Box Fee:", ethers.formatEther(config.fees.utilityBoxFee), "ETH");
    console.log("  - Platform Fee:", config.platform.defaultPlatformFeePercentage / 10, "%");
    console.log("  - Utility Box NFT URI:", config.ipfs.utilityBoxNftUri);

    // --- Step 1: Deploy HybridCommunityPlatform Contract ---
    console.log("\n🏗️  Step 1: Deploying HybridCommunityPlatform Contract...");
    
    try {
        const HybridCommunityPlatform = await ethers.getContractFactory("HybridCommunityPlatform");
        
        // Check contract size before deployment
        const contractSize = HybridCommunityPlatform.bytecode.length / 2;
        console.log("📏 Contract bytecode size:", contractSize, "bytes");
        console.log("📏 Contract size:", (contractSize / 1024).toFixed(2), "KB");
        
        if (contractSize > 24576) {
            console.log("⚠️  WARNING: Contract size exceeds 24KB limit!");
            console.log("📊 Size limit: 24KB (24,576 bytes)");
            console.log("📊 Current size:", (contractSize / 1024).toFixed(2), "KB");
            console.log("📊 Excess:", ((contractSize - 24576) / 1024).toFixed(2), "KB");
        } else {
            console.log("✅ Contract size is within 24KB limit");
        }

        const spheresContract = await HybridCommunityPlatform.deploy();
        await spheresContract.waitForDeployment();
        
        const contractAddress = await spheresContract.getAddress();
        console.log("✅ HybridCommunityPlatform deployed to:", contractAddress);

        // --- Step 2: Configure Contract Settings ---
        console.log("\n⚙️  Step 2: Configuring contract settings...");
        
        // Set Utility Box NFT URI
        console.log("  - Setting Utility Box NFT URI...");
        const setUtilityBoxUriTx = await spheresContract.setUtilityBoxNftUri(config.ipfs.utilityBoxNftUri);
        await setUtilityBoxUriTx.wait();
        console.log("  ✅ Utility Box NFT URI set");

        // Mystery Box system was removed - skipping bet limits configuration
        console.log("  - Mystery Box system removed - skipping bet limits");

        // Set other fees
        console.log("  - Setting fees...");
        const setCreationFeeTx = await spheresContract.setCreationFee(config.fees.creationFeeEth);
        await setCreationFeeTx.wait();
        
        const setUtilityBoxFeeTx = await spheresContract.setUtilityBoxFee(config.fees.utilityBoxFee);
        await setUtilityBoxFeeTx.wait();
        
        const setAchievementFeeTx = await spheresContract.setAchievementUnlockFee(config.fees.achievementUnlockFee);
        await setAchievementFeeTx.wait();
        
        const setBoostFeeTx = await spheresContract.setBoostPurchaseFee(config.fees.boostPurchaseFee);
        await setBoostFeeTx.wait();
        
        const setEventFeeTx = await spheresContract.setEventPlatformFee(config.fees.eventPlatformFee);
        await setEventFeeTx.wait();
        
        console.log("  ✅ All fees configured");

        // --- Step 3: Mystery Box Funding (Removed) ---
        console.log("\n💰 Step 3: Mystery Box system removed - skipping funding");

        // --- Step 4: Verify Contract State ---
        console.log("\n🔍 Step 4: Verifying contract state...");
        
        const owner = await spheresContract.owner();
        const creationFee = await spheresContract.creationFeeEth();
        const utilityBoxFee = await spheresContract.utilityBoxFee();
        
        console.log("  - Owner:", owner);
        console.log("  - Creation Fee:", ethers.formatEther(creationFee), "ETH");
        console.log("  - Utility Box Fee:", ethers.formatEther(utilityBoxFee), "ETH");
        console.log("  - Mystery Box: System removed for contract size optimization");

        // --- Step 5: Save Deployment Info ---
        console.log("\n💾 Step 5: Saving deployment information...");
        
        const network = await ethers.provider.getNetwork();
        const deploymentInfo = {
            network: {
                name: network.name,
                chainId: Number(network.chainId)
            },
            contract: {
                name: "HybridCommunityPlatform",
                address: contractAddress,
                deployer: deployer.address,
                deploymentBlock: await ethers.provider.getBlockNumber(),
                bytecodeSize: contractSize,
                bytecodeSizeKB: (contractSize / 1024).toFixed(2)
            },
            configuration: config,
            deploymentDate: new Date().toISOString(),
            optimizerRuns: 50
        };

        const deploymentPath = path.join(__dirname, 'deployment-spheres-core.json');
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value, 2));
        console.log("  ✅ Deployment info saved to:", deploymentPath);

        // --- Final Summary ---
        console.log("\n🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
        console.log("=====================================");
        console.log("Contract Address:", contractAddress);
        console.log("Network:", network.name, "(Chain ID:", Number(network.chainId) + ")");
        console.log("Deployer:", deployer.address);
        console.log("Contract Size:", (contractSize / 1024).toFixed(2), "KB");
        console.log("Optimizer Runs: 50");
        console.log("Gas Used: Check transaction receipts above");
        console.log("=====================================");

        return {
            contractAddress,
            deploymentInfo
        };

    } catch (error) {
        console.error("❌ Deployment failed:", error);
        
        if (error.message.includes("contract code size")) {
            console.log("\n💡 Contract size optimization suggestions:");
            console.log("  1. The contract might still be too large even after optimization");
            console.log("  2. Consider removing more features or splitting into multiple contracts");
            console.log("  3. Current optimizer runs: 50 (good for deployment size)");
        }
        
        throw error;
    }
}

// Execute deployment
if (require.main === module) {
    deploySpheresCore()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = deploySpheresCore; 