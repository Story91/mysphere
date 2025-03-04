import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../config/contract";
import { useState, useCallback, useEffect } from "react";
import { Player, BaseElement, ElementType, Rarity } from "@/types/contract";
import { baseSepolia } from "viem/chains";

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
    } catch (error) {
      console.error("Fusion failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [address, walletClient, publicClient, switchChain, fetchPlayerData, fetchElements]);

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
    refetch: useCallback(async () => {
      await Promise.all([fetchPlayerData(), fetchElements()]);
    }, [fetchPlayerData, fetchElements]),
  };
} 