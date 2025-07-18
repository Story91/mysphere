// PaidPinContract configuration for Base Mainnet
// Replace YOUR_CONTRACT_ADDRESS with actual deployed address

export const PAID_PIN_CONTRACT_CONFIG = {
  address: "0x163bd9Ec5267491963163dE70D0B64f9400a20AD", // ✅ DEPLOYED CONTRACT
  chainId: 8453, // Base Mainnet
  blockExplorer: "https://basescan.org"
};

// Contract ABI for frontend integration (from deployed contract)
export const PAID_PIN_CONTRACT_ABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "string",
				"name": "postId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "enum PaidPinContract.PinDuration",
				"name": "duration",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "expiresAt",
				"type": "uint256"
			}
		],
		"name": "PinCreated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "string",
				"name": "postId",
				"type": "string"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			}
		],
		"name": "PinExpired",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "string",
				"name": "postId",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "newExpiresAt",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "additionalAmount",
				"type": "uint256"
			}
		],
		"name": "PinExtended",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "enum PaidPinContract.PinDuration",
				"name": "duration",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "newPrice",
				"type": "uint256"
			}
		],
		"name": "PriceUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "owner",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "RevenueWithdrawn",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "postId",
				"type": "string"
			},
			{
				"internalType": "enum PaidPinContract.PinDuration",
				"name": "duration",
				"type": "uint8"
			}
		],
		"name": "pinPost",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "postId",
				"type": "string"
			},
			{
				"internalType": "enum PaidPinContract.PinDuration",
				"name": "additionalDuration",
				"type": "uint8"
			}
		],
		"name": "extendPin",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "postId",
				"type": "string"
			}
		],
		"name": "isPinActive",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "postId",
				"type": "string"
			}
		],
		"name": "getPinDetails",
		"outputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "owner",
						"type": "address"
					},
					{
						"internalType": "string",
						"name": "postId",
						"type": "string"
					},
					{
						"internalType": "enum PaidPinContract.PinDuration",
						"name": "duration",
						"type": "uint8"
					},
					{
						"internalType": "uint256",
						"name": "paidAmount",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "expiresAt",
						"type": "uint256"
					},
					{
						"internalType": "bool",
						"name": "isActive",
						"type": "bool"
					},
					{
						"internalType": "uint256",
						"name": "createdAt",
						"type": "uint256"
					}
				],
				"internalType": "struct PaidPinContract.Pin",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "enum PaidPinContract.PinDuration",
				"name": "duration",
				"type": "uint8"
			}
		],
		"name": "getPrice",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "user",
				"type": "address"
			}
		],
		"name": "getUserPins",
		"outputs": [
			{
				"internalType": "string[]",
				"name": "",
				"type": "string[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getTotalPins",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getBalance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

// Duration enum mapping (matches contract)
export enum ContractPinDuration {
  HOUR_1 = 0,
  HOURS_6 = 1, 
  HOURS_24 = 2,
  DAYS_7 = 3
}

// Price mapping in ETH
export const CONTRACT_PIN_PRICES = {
  [ContractPinDuration.HOUR_1]: "0.0005",
  [ContractPinDuration.HOURS_6]: "0.002", 
  [ContractPinDuration.HOURS_24]: "0.005",
  [ContractPinDuration.DAYS_7]: "0.02"
}; 