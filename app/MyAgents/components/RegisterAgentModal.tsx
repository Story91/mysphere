"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const SUPPORTED_CHAINS = [
  { id: "base", label: "Base", chainId: 8453 },
  { id: "basecamp", label: "Camp", chainId: 123420111 },
  { id: "linea", label: "Linea", chainId: 59144 },
  { id: "celo", label: "Celo", chainId: 42220 },
  { id: "ethereum", label: "Ethereum", chainId: 1 },
  { id: "worldchain", label: "World Chain", chainId: 480 },
];

interface RegisterAgentModalProps {
  open: boolean;
  onClose: () => void;
}

export function RegisterAgentModal({ open, onClose }: RegisterAgentModalProps) {
  const [address, setAddress] = useState("");
  const [selectedChain, setSelectedChain] = useState("base");
  const [step, setStep] = useState<"form" | "info">("form");

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  const handleSubmit = () => {
    setStep("info");
  };

  const handleClose = () => {
    setAddress("");
    setSelectedChain("base");
    setStep("form");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-white border border-gray-100 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900 font-['Coinbase_Display']">
            Register Your Agent
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Submit your AI agent for on-chain identity verification via ERC-8004.
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="flex flex-col gap-5 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-gray-700">Agent / Owner Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..."
                className="font-mono text-sm rounded-xl border-gray-200 focus:border-[#0052FF] focus:ring-[#0052FF]/20"
              />
              {address && !isValidAddress && (
                <p className="text-xs text-red-500">Must be a valid Ethereum address</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-gray-700">Primary Chain</Label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => setSelectedChain(chain.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      selectedChain === chain.id
                        ? "bg-[#0052FF] text-white border-[#0052FF]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {chain.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 flex flex-col gap-1">
              <p className="text-xs font-semibold text-blue-700">How verification works</p>
              <p className="text-xs text-blue-600 leading-relaxed">
                Your agent must be registered on the ERC-8004 registry on the selected chain.
                KYA will automatically index it and assign a <strong>masterAgentId</strong> within ~24h.
                Once indexed, your agent can receive on-chain reputation feedback.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 rounded-xl border-gray-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValidAddress}
                className="flex-1 rounded-xl bg-[#0052FF] hover:bg-[#0045D8] text-white"
              >
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-semibold text-emerald-700">Submission received</p>
              </div>
              <p className="text-xs text-emerald-600 font-mono break-all">{address}</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-gray-700">Next steps:</p>
              <ol className="flex flex-col gap-2 text-xs text-gray-600">
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</span>
                  Register your agent contract on the ERC-8004 registry on {SUPPORTED_CHAINS.find(c => c.id === selectedChain)?.label}
                </li>
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</span>
                  KYA indexer will discover it automatically within 24 hours
                </li>
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</span>
                  Your agent profile will appear here with a KYA Verified badge
                </li>
              </ol>
            </div>

            <div className="flex gap-3">
              <a
                href={`https://registrai-web.pages.dev/`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button variant="outline" className="w-full rounded-xl border-gray-200 text-sm">
                  View on RegistrAI ↗
                </Button>
              </a>
              <Button
                onClick={handleClose}
                className="flex-1 rounded-xl bg-[#0052FF] hover:bg-[#0045D8] text-white text-sm"
              >
                Done
              </Button>
            </div>

            <p className="text-[10px] text-gray-400 text-center">
              Powered by{" "}
              <a href="https://registrai-web.pages.dev/" target="_blank" rel="noopener noreferrer" className="text-[#0052FF] hover:underline">
                KYA · RegistrAI
              </a>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
