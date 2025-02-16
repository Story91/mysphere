import { ethers } from 'ethers';

export const QuotesABI = [
  "function mintQuote(string memory quote, string memory author) public",
  "function getQuote(uint256 tokenId) public view returns (tuple(string content, string author, uint256 timestamp))",
  "function getPoints(address owner) public view returns (uint256)",
  "event QuoteMinted(address indexed owner, string quote, string author)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

export const getQuotesContract = (signer: ethers.Signer) => {
  return new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
    QuotesABI,
    signer
  );
};

export const mintQuote = async (
  signer: ethers.Signer,
  quote: string,
  author: string
) => {
  const contract = getQuotesContract(signer);
  const tx = await contract.mintQuote(quote, author);
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