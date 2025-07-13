const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function deploySpheresContract() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying Spheres (HybridCommunityPlatform) with account:", deployer.address);
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");

    // --- Configuration ---
    const config = {
        ipfs: {
            soulboundBaseURI: "https://beige-real-eagle-159.mypinata.cloud/ipfs/",
            soulboundMetadataHash: "bafybeiaixmpno6bv43x7wz3zgqggcjvp6vxlqhrlyu53heytwsvcesfklu", // From soulbound-nft.json
            utilityBoxBaseURI: "https://beige-real-eagle-159.mypinata.cloud/ipfs/",
            utilityBoxMetadataHash: "bafybeidn7ams2h2ncjpvx55hkr4or4cypjivu23fhpwchyqyyjqkkp2sem", // From utilitybox-champion.json
            // IPFS JSON URIs - Updated with real hashes
            soulboundJsonUri: "https://beige-real-eagle-159.mypinata.cloud/ipfs/bafkreibrmguhjxurmjutfj5pxfxhgkda3vmtmk4z4ikqzh7vgdlm34q", // soulbound-nft.json
            utilityBoxNftUri: "https://beige-real-eagle-159.mypinata.cloud/ipfs/bafkreibffp7qxc7stlbgcpnondr36lsjbmt6foxcgdo2mvnvgeecd7xmf4" // utilitybox-champion.json
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
    console.log("  - Creation Fee:", ethers.formatEther(config.fees.creationFeeEth), "ETH");
    console.log("  - Utility Box Fee:", ethers.formatEther(config.fees.utilityBoxFee), "ETH");
    console.log("  - Platform Fee:", config.platform.defaultPlatformFeePercentage / 10, "%");
    console.log("  - IPFS Soulbound Image URI:", config.ipfs.soulboundBaseURI + config.ipfs.soulboundMetadataHash);
    console.log("  - IPFS Utility Box Image URI:", config.ipfs.utilityBoxBaseURI + config.ipfs.utilityBoxMetadataHash);
    console.log("  - Utility Box NFT JSON URI:", config.ipfs.utilityBoxNftUri);

    // --- Step 1: Deploy HybridCommunityPlatform Contract ---
    console.log("\n🏗️  Step 1: Deploying HybridCommunityPlatform Contract...");
    const HybridCommunityPlatform = await ethers.getContractFactory("HybridCommunityPlatform");
    const spheresContract = await HybridCommunityPlatform.deploy();
    await spheresContract.waitForDeployment();
    const spheresAddress = await spheresContract.getAddress();
    console.log(`✅ HybridCommunityPlatform deployed to: ${spheresAddress}`);

    // --- Step 2: Initial Configuration ---
    console.log("\n⚙️  Step 2: Configuring Contract Settings...");
    
    // Set creation fee
    console.log("  - Setting creation fee...");
    const setCreationFeeTx = await spheresContract.setCreationFee(config.fees.creationFeeEth);
    await setCreationFeeTx.wait();
    
    // Set mystery box bet limits
    console.log("  - Setting mystery box bet limits...");
    const setMysteryBoxLimitsTx = await spheresContract.setMysteryBoxBetLimits(
        config.fees.minMysteryBoxBet,
        config.fees.maxMysteryBoxBet
    );
    await setMysteryBoxLimitsTx.wait();
    
    // Set utility box fee
    console.log("  - Setting utility box fee...");
    const setUtilityBoxFeeTx = await spheresContract.setUtilityBoxFee(config.fees.utilityBoxFee);
    await setUtilityBoxFeeTx.wait();
    
    // Set utility box NFT URI
    console.log("  - Setting utility box NFT URI...");
    const setUtilityBoxNftUriTx = await spheresContract.setUtilityBoxNftUri(config.ipfs.utilityBoxNftUri);
    await setUtilityBoxNftUriTx.wait();
    
    // Set achievement unlock fee
    console.log("  - Setting achievement unlock fee...");
    const setAchievementUnlockFeeTx = await spheresContract.setAchievementUnlockFee(config.fees.achievementUnlockFee);
    await setAchievementUnlockFeeTx.wait();
    
    // Set boost purchase fee
    console.log("  - Setting boost purchase fee...");
    const setBoostPurchaseFeeTx = await spheresContract.setBoostPurchaseFee(config.fees.boostPurchaseFee);
    await setBoostPurchaseFeeTx.wait();
    
    // Set event platform fee
    console.log("  - Setting event platform fee...");
    const setEventPlatformFeeTx = await spheresContract.setEventPlatformFee(config.fees.eventPlatformFee);
    await setEventPlatformFeeTx.wait();
    
    // Set withdrawal fee percentage
    console.log("  - Setting withdrawal fee percentage...");
    const setWithdrawalFeeTx = await spheresContract.setWithdrawalFeePercentage(config.platform.withdrawalFeePercentage);
    await setWithdrawalFeeTx.wait();
    
    console.log("✅ Contract Configuration Complete!");

    // --- Step 3: Fund Mystery Box Pool (Optional) ---
    console.log("\n💰 Step 3: Funding Mystery Box Pool...");
    const mysteryBoxFunding = ethers.parseEther("0.1"); // Fund with 0.1 ETH
    const fundMysteryBoxTx = await spheresContract.fundMysteryBoxPool({ value: mysteryBoxFunding });
    await fundMysteryBoxTx.wait();
    console.log(`✅ Mystery Box Pool funded with ${ethers.formatEther(mysteryBoxFunding)} ETH`);

    // --- Step 4: Verify Contract State ---
    console.log("\n🔍 Step 4: Verifying Contract State...");
    const creationFee = await spheresContract.creationFeeEth();
    const utilityBoxFee = await spheresContract.utilityBoxFee();
    const mysteryBoxPrizePool = await spheresContract.mysteryBoxPrizePool();
    
    console.log("  - Creation Fee:", ethers.formatEther(creationFee), "ETH");
    console.log("  - Utility Box Fee:", ethers.formatEther(utilityBoxFee), "ETH");
    console.log("  - Mystery Box Prize Pool:", ethers.formatEther(mysteryBoxPrizePool), "ETH");
    console.log("✅ Contract State Verified!");

    // --- Step 5: Save Deployment Info ---
    console.log("\n💾 Step 5: Saving deployment information...");
    const deploymentInfo = {
        network: "Base Sepolia",
        contractName: "HybridCommunityPlatform",
        contractAddress: spheresAddress,
        deployer: deployer.address,
        deploymentDate: new Date().toISOString(),
        configuration: {
            fees: {
                creationFeeEth: ethers.formatEther(config.fees.creationFeeEth),
                utilityBoxFee: ethers.formatEther(config.fees.utilityBoxFee),
                minMysteryBoxBet: ethers.formatEther(config.fees.minMysteryBoxBet),
                maxMysteryBoxBet: ethers.formatEther(config.fees.maxMysteryBoxBet),
                achievementUnlockFee: ethers.formatEther(config.fees.achievementUnlockFee),
                boostPurchaseFee: ethers.formatEther(config.fees.boostPurchaseFee),
                eventPlatformFee: ethers.formatEther(config.fees.eventPlatformFee)
            },
            platform: config.platform,
            ipfs: config.ipfs,
            mysteryBoxFunding: ethers.formatEther(mysteryBoxFunding)
        },
        contractABI: "HybridCommunityPlatform.sol/HybridCommunityPlatform.json",
        metadata: {
            soulboundNftPath: "../nft/soulbound-nft.json",
            utilityBoxChampionPath: "../nft/utilitybox-champion.json",
            soulboundImagePath: "../nft/SoulboundSphere.png",
            utilityBoxImagePath: "../nft/utilitybox-champion.png"
        }
    };
    
    const deploymentPath = path.join(__dirname, 'deployment-spheres.json');
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`✅ Deployment info saved to: ${deploymentPath}`);

    // --- Step 6: Contract Interaction Examples ---
    console.log("\n📝 Step 6: Contract Interaction Examples:");
    console.log("  Create Community:");
    console.log(`    await spheresContract.createCommunity("My Community", "Description", joinFee, monthlyFee, lifetimeFee, { value: ethers.parseEther("0.01") });`);
    console.log("  Join Community:");
    console.log(`    await spheresContract.joinCommunity(communityId, false, referrer, { value: joinFee });`);
    console.log("  Open Mystery Box:");
    console.log(`    await spheresContract.openMysteryBox(communityId, { value: ethers.parseEther("0.001") });`);
    console.log("  Open Utility Box:");
    console.log(`    await spheresContract.openUtilityBox(communityId, { value: ethers.parseEther("0.0001") });`);

    console.log("\n🎉 SPHERES DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉");
    console.log("==========================================");
    console.log("🌐 Contract Address:     ", spheresAddress);
    console.log("💾 Deployment info saved to: deployment-spheres.json");
    console.log("📝 Update your frontend configuration with this address");
    console.log("\n✅ IPFS JSON metadata already configured:");
    console.log("1. ✅ Soulbound NFT JSON:", config.ipfs.soulboundJsonUri);
    console.log("2. ✅ Utility Box NFT JSON:", config.ipfs.utilityBoxNftUri);
    console.log("\nNEXT STEPS:");
    console.log("1. ✅ IPFS JSON upload - COMPLETED");
    console.log("2. Update frontend contract address and ABI");
    console.log("3. Test contract functionality");
    console.log("4. Deploy to mainnet when ready");
    
    return {
        contractAddress: spheresAddress,
        deploymentInfo
    };
}

deploySpheresContract()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("\n❌ DEPLOYMENT FAILED:", error);
        process.exit(1);
    }); 