export const CONTRACT_ADDRESS = "0xdaD4777b825548F3eeAD4bc6cAC8499ca2776fC2" as const;

export const CONTRACT_ABI = [
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayer",
    outputs: [
      { name: "xp", type: "uint256" },
      { name: "lastCheckIn", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "baseLevel", type: "uint8" },
      { name: "isActive", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerNFTs",
    outputs: [
      {
        components: [
          { name: "id", type: "string" },
          { name: "elementType", type: "uint8" },
          { name: "rarity", type: "uint8" },
          { name: "level", type: "uint8" },
          { name: "power", type: "uint256" },
          { name: "mintedAt", type: "uint256" }
        ],
        name: "elements",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "checkIn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "tokenIds", type: "string[]" }],
    name: "fuseElements",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "players",
    outputs: [
      { name: "xp", type: "uint256" },
      { name: "lastCheckIn", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "baseLevel", type: "uint8" },
      { name: "isActive", type: "bool" },
      { name: "lastPvpBattle", type: "uint256" },
      { name: "pvpWins", type: "uint256" },
      { name: "resources", type: "uint256" },
      { name: "allianceId", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;
