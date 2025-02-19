import { ethers } from 'ethers';

export const QuotesABI = [
  "function mintQuote(string memory quote, string memory author, string memory tokenURI) public",
  "function getQuote(uint256 tokenId) public view returns (tuple(string content, string author, uint256 timestamp))",
  "function getPoints(address owner) public view returns (uint256)",
  "event QuoteMinted(address indexed owner, string quote, string author, string tokenURI)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

// Adres kontraktu na Base mainnet
const CONTRACT_ADDRESS = "0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E";

export const getQuotesContract = (signer: ethers.Signer) => {
  return new ethers.Contract(
    CONTRACT_ADDRESS,
    QuotesABI,
    signer
  );
};

export const mintQuote = async (
  signer: ethers.Signer,
  quote: string,
  author: string,
  tokenURI: string
) => {
  const contract = getQuotesContract(signer);
  const tx = await contract.mintQuote(quote, author, tokenURI);
  await tx.wait();
  return tx;
};

export const getPoints = async (
  signer: ethers.Signer,
  address: string
) => {
  const contract = getQuotesContract(signer);
  return await contract.getPoints(address);
}; 