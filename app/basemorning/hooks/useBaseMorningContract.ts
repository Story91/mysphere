import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI, NFT_CONTRACT_ADDRESS, NFT_CONTRACT_ABI } from "../config/contract";
import { useState, useCallback, useEffect } from "react";
import { Player, BaseElement, ElementType, Rarity } from "@/types/contract";
import { baseSepolia } from "viem/chains";
import { parseEther } from "viem";

export function useBaseMorningContract() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const [isLoading, setIsLoading] = useState(false);
  const [playerData, setPlayerData] = useState<Player | undefined>();
  const [elements, setElements] = useState<BaseElement[]>([]);
  const [timeUntilNextCheckIn, setTimeUntilNextCheckIn] = useState<number>(0);

  const updateTimeUntilNextCheckIn = useCallback(() => {
    if (!playerData?.lastCheckIn) return;

    const now = Math.floor(Date.now() / 1000);
    const CHECK_IN_COOLDOWN = 24 * 60 * 60; // 24 hours in seconds
    const nextCheckIn = Number(playerData.lastCheckIn) + CHECK_IN_COOLDOWN;
    const timeLeft = Math.max(0, nextCheckIn - now);
    setTimeUntilNextCheckIn(timeLeft);
  }, [playerData?.lastCheckIn]);

  useEffect(() => {
    updateTimeUntilNextCheckIn();
    const interval = setInterval(updateTimeUntilNextCheckIn, 1000);
    return () => clearInterval(interval);
  }, [updateTimeUntilNextCheckIn]);

  const fetchPlayerData = useCallback(async () => {
    if (!address || !publicClient) return;

    try {
      const [playerState, nfts] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "players",
          args: [address],
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "getPlayerNFTs",
          args: [address],
        })
      ]);

      setPlayerData({
        xp: playerState[0],
        lastCheckIn: playerState[1],
        streak: playerState[2],
        baseLevel: Number(playerState[3]),
        isActive: playerState[4],
        resources: Number(playerState[7] || 0),
        activeMissions: [],
      });

      updateTimeUntilNextCheckIn();
    } catch (error) {
      console.error("Error fetching player data:", error);
    }
  }, [address, publicClient, updateTimeUntilNextCheckIn]);

  const fetchElements = useCallback(async () => {
    if (!address || !publicClient) return;

    try {
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getPlayerNFTs",
        args: [address],
      });

      // Konwertujemy wynik na tablicę elementów
      const elements = result[0] as unknown as Array<{
        id: string;
        elementType: number;
        rarity: number;
        level: number;
        power: bigint;
        mintedAt: bigint;
      }>;

      const convertedElements: BaseElement[] = elements.map(nft => ({
        id: nft.id,
        elementType: Object.values(ElementType)[nft.elementType],
        rarity: Object.values(Rarity)[nft.rarity],
        level: nft.level,
        power: Number(nft.power),
        mintedAt: Number(nft.mintedAt)
      }));

      setElements(convertedElements);
    } catch (error) {
      console.error("Error fetching elements:", error);
    }
  }, [address, publicClient]);



  const register = useCallback(async () => {
    if (!walletClient || !address || !publicClient) return;

    setIsLoading(true);
    try {
      await switchChain({ chainId: baseSepolia.id });

      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "register",
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
      await fetchPlayerData();
    } catch (error) {
      console.error("Registration failed:", error);
      throw error; // Propagujemy błąd, żeby móc go obsłużyć w checkIn
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, switchChain, fetchPlayerData]);

  const checkIn = useCallback(async () => {
    if (!walletClient || !address || !publicClient) return;

    setIsLoading(true);
    try {
      await switchChain({ chainId: baseSepolia.id });

      // Sprawdzamy stan gracza bezpośrednio z mappingu players
      const playerState = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "players",
        args: [address],
      });

      const isActive = playerState[4];
      const lastCheckIn = Number(playerState[1]);
      const now = Math.floor(Date.now() / 1000);
      const CHECK_IN_COOLDOWN = 24 * 60 * 60; // 24 hours in seconds

      console.log("Player state:", {
        isActive,
        lastCheckIn,
        timeSinceLastCheckIn: now - lastCheckIn,
        cooldownRequired: CHECK_IN_COOLDOWN
      });

      if (!isActive) {
        console.log("Player not active, attempting registration...");
        try {
          await register();
          console.log("Registration successful, proceeding with check-in");
        } catch (error: any) {
          if (error.message?.includes("Player already registered")) {
            console.log("Player already registered, proceeding with check-in");
          } else {
            throw error;
          }
        }
      } else if (now < lastCheckIn + CHECK_IN_COOLDOWN) {
        const hoursLeft = Math.ceil((lastCheckIn + CHECK_IN_COOLDOWN - now) / 3600);
        throw new Error(`Too early for check-in. Please wait ${hoursLeft} hours.`);
      }

      console.log("Attempting check-in...");
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "checkIn",
        account: address,
      });

      console.log("Check-in simulation successful, executing transaction...");
      const hash = await walletClient.writeContract(request);
      console.log("Transaction sent, waiting for receipt...", hash);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log("Transaction confirmed, updating data...");
      await Promise.all([fetchPlayerData(), fetchElements()]);
      console.log("Check-in completed successfully");
    } catch (error: any) {
      console.error("Check-in failed:", {
        error,
        message: error.message,
        cause: error.cause,
        details: error.details
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, switchChain, fetchPlayerData, fetchElements, register]);

  const fuseElements = useCallback(async (elementIds: string[]) => {
    if (!walletClient || !address || !publicClient) return;

    setIsLoading(true);
    try {
      await switchChain({ chainId: baseSepolia.id });

      // Check if NFT contract address is configured
      if (NFT_CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        throw new Error("NFT contract address not configured. Please deploy contracts first.");
      }

      // Check if the game contract is approved to manage user's NFTs
      const isApproved = await publicClient.readContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: NFT_CONTRACT_ABI,
        functionName: "isApprovedForAll",
        args: [address, CONTRACT_ADDRESS],
      });

      // If not approved, request approval first
      if (!isApproved) {
        console.log("Requesting NFT approval for fusion...");
        const { request: approvalRequest } = await publicClient.simulateContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_CONTRACT_ABI,
          functionName: "setApprovalForAll",
          args: [CONTRACT_ADDRESS, true],
          account: address,
        });

        const approvalHash = await walletClient.writeContract(approvalRequest);
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        console.log("NFT approval granted successfully");
      }

      // Now proceed with fusion
      console.log("Proceeding with element fusion...");
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "fuseElements",
        args: [elementIds],
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([fetchPlayerData(), fetchElements()]);
      console.log("Element fusion completed successfully");
    } catch (error: any) {
      console.error("Fusion failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, switchChain, fetchPlayerData, fetchElements]);

  // NEW: Mint element function with payment
  const mintElement = useCallback(async () => {
    if (!walletClient || !address || !publicClient) return;

    setIsLoading(true);
    try {
      await switchChain({ chainId: baseSepolia.id });

      // Check if player is registered
      const playerState = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "players",
        args: [address],
      });

      const isActive = playerState[4];
      if (!isActive) {
        console.log("Player not active, attempting registration...");
        await register();
      }

      // Get mint price from contract
      const mintPrice = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getMintPrice",
      });

      console.log("Minting element with price:", mintPrice);

      // Execute paid minting
      const { request } = await (publicClient as any).simulateContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "mintElement",
        value: mintPrice,
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([fetchPlayerData(), fetchElements()]);
      console.log("Element minted successfully");
    } catch (error: any) {
      console.error("Minting failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, switchChain, fetchPlayerData, fetchElements, register]);

  // NEW: Get mint price function
  const getMintPrice = useCallback(async () => {
    if (!publicClient) return parseEther("0.00005");

    try {
      const price = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getMintPrice",
      });
      return price;
    } catch (error) {
      console.error("Error getting mint price:", error);
      return parseEther("0.00005"); // fallback to hardcoded price
    }
  }, [publicClient]);

  // NEW: Batch mint elements function with automatic discounts
  const mintElements = useCallback(async (quantity: number) => {
    if (!walletClient || !address || !publicClient) return;

    setIsLoading(true);
    try {
      await switchChain({ chainId: baseSepolia.id });

      // Check if player is registered
      const playerState = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "players",
        args: [address],
      });

      const isActive = playerState[4];
      if (!isActive) {
        console.log("Player not active, attempting registration...");
        await register();
      }

      // Get batch price from contract (includes automatic discounts)
      const batchPrice = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "calculateBatchPrice",
        args: [quantity],
      });

      console.log(`Batch minting ${quantity} elements with price:`, batchPrice);

      // Execute batch minting
      const { request } = await (publicClient as any).simulateContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "mintElements",
        args: [quantity],
        value: batchPrice,
        account: address,
      });

      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
      await Promise.all([fetchPlayerData(), fetchElements()]);
      console.log(`${quantity} elements minted successfully with batch discount`);
    } catch (error: any) {
      console.error("Batch minting failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, switchChain, fetchPlayerData, fetchElements, register]);

  // NEW: Calculate batch price with discounts
  const calculateBatchPrice = useCallback(async (quantity: number) => {
    if (!publicClient) return parseEther("0.00005") * BigInt(quantity);

    try {
      const price = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "calculateBatchPrice",
        args: [quantity],
      });
      return price;
    } catch (error) {
      console.error("Error calculating batch price:", error);
      return parseEther("0.00005") * BigInt(quantity); // fallback
    }
  }, [publicClient]);

  // NEW: Get discount percentage for quantity
  const getDiscountPercent = useCallback(async (quantity: number) => {
    if (!publicClient) {
      // Fallback discount logic
      if (quantity >= 10) return 15;
      if (quantity >= 5) return 10;
      if (quantity >= 3) return 5;
      return 0;
    }

    try {
      const discount = await (publicClient as any).readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getDiscountPercent",
        args: [quantity],
      });
      return Number(discount);
    } catch (error) {
      console.error("Error getting discount percent:", error);
      // Fallback discount logic
      if (quantity >= 10) return 15;
      if (quantity >= 5) return 10;
      if (quantity >= 3) return 5;
      return 0;
    }
  }, [publicClient]);

  useEffect(() => {
    if (isConnected) {
      fetchPlayerData();
      fetchElements();
    }
  }, [isConnected, fetchPlayerData, fetchElements]);

  return {
    playerData,
    elements,
    isLoading,
    checkIn,
    fuseElements,
    register,
    timeUntilNextCheckIn,
    mintElement, // NEW
    getMintPrice, // NEW
    mintElements, // NEW
    calculateBatchPrice, // NEW
    getDiscountPercent, // NEW
    refetch: useCallback(async () => {
      await Promise.all([fetchPlayerData(), fetchElements()]);
    }, [fetchPlayerData, fetchElements]),
  };
} 