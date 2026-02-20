import { KYAClient } from "@registrai/kya";

export const kya = new KYAClient({
  baseUrl: process.env.NEXT_PUBLIC_KYA_API_URL || "https://api.registrai.cc",
  apiKey: process.env.KYA_API_KEY,
});
