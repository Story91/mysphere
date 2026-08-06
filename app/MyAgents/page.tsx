"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import Image from "next/image";
import { StatsBar } from "./components/StatsBar";
import { AgentGrid } from "./components/AgentGrid";
import { RegisterAgentModal } from "./components/RegisterAgentModal";
import { useAgents } from "./hooks/useAgents";
import { Input } from "@/components/ui/input";
import type { AgentFilters, SupportedChain } from "./types";

const CHAINS: { id: SupportedChain | "all"; label: string }[] = [
  { id: "all",        label: "All Chains" },
  { id: "base",       label: "Base" },
  { id: "basecamp",   label: "Camp" },
  { id: "linea",      label: "Linea" },
  { id: "celo",       label: "Celo" },
  { id: "ethereum",   label: "Ethereum" },
  { id: "worldchain", label: "World Chain" },
];

const SCORE_PRESETS = [
  { label: "Any",  value: 0 },
  { label: "50+",  value: 50 },
  { label: "70+",  value: 70 },
  { label: "90+",  value: 90 },
];

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: "Discover Agents",
    desc: "Browse 6,000+ AI agents indexed across 20+ EVM chains with real-time on-chain data and cross-chain identity.",
    accent: "from-blue-500 to-[#0052FF]",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Verify Identity",
    desc: "Every agent is anchored to the ERC-8004 standard. Cross-chain identity gives you full trust context instantly.",
    accent: "from-emerald-400 to-green-600",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    title: "Rate & Review",
    desc: "Submit on-chain feedback that builds permanent reputation. Your reviews shape the trustworthiness of the agentic economy.",
    accent: "from-amber-400 to-orange-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    ),
    title: "Register Your Agent",
    desc: "Give your AI agent a verifiable on-chain identity. Register once, recognized everywhere across the multichain ecosystem.",
    accent: "from-violet-500 to-purple-600",
    bg: "bg-violet-50",
    text: "text-violet-700",
  },
];

const CHAIN_LOGOS: { id: SupportedChain | "all"; label: string; src: string }[] = [
  { id: "base",       label: "Base",        src: "/logotypy/Base_square_blue.png" },
  { id: "basecamp",   label: "Camp",        src: "/Camp.png" },
  { id: "linea",      label: "Linea",       src: "/Logomark Blue BG.svg" },
  { id: "celo",       label: "Celo",        src: "/logotypy/AkeHh5LriDwrNIvVvUQ66wSHU.webp" },
  { id: "ethereum",   label: "Ethereum",    src: "/icons/eth.svg" },
  { id: "worldchain", label: "World Chain", src: "/logotypy/world-symbol-dark.svg" },
];

function AnimatedCounter({ target, duration = 1.5 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration * 60);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

export default function MyAgentsPage() {
  const [filters, setFilters]       = useState<AgentFilters>({ network: "mainnet" });
  const [selectedChain, setSelectedChain] = useState<string>("all");
  const [minScore, setMinScore]     = useState(0);
  const [search, setSearch]         = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);

  const { agents, loading, loadingMore, error, hasMore, loadMore } = useAgents(filters);
  const explorerRef = useRef<HTMLDivElement>(null);

  const filteredAgents = agents.filter((agent) => {
    const addr  = (agent as any).ownerAddress ?? (agent as any).masterAgentId ?? "";
    const score = (agent as any).score ?? (agent as any).reputation?.value ?? 0;
    return (!search || addr.toLowerCase().includes(search.toLowerCase())) && score >= minScore;
  });

  const handleChainSelect = (chain: string) => {
    setSelectedChain(chain);
    setFilters((prev) => ({
      ...prev,
      chain: chain === "all" ? undefined : (chain as SupportedChain),
    }));
  };

  const scrollToExplorer = () =>
    explorerRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">

      {/* ─── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a0a1a] via-[#0c1a3a] to-[#0a0a1a] text-white">
        {/* Subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,82,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(0,82,255,0.07)_1px,transparent_1px)] bg-[size:64px_64px]" />
        {/* Glow blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#0052FF]/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/15 rounded-full blur-[100px]" />

        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-24 flex flex-col items-center text-center">
          {/* Badges */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-7 flex-wrap justify-center"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0052FF]/40 bg-[#0052FF]/10 px-3.5 py-1 text-xs font-semibold text-[#4C8FFF] backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4C8FFF] animate-pulse" />
              ERC-8004 Standard
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Powered by KYA · RegistrAI
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight leading-none mb-6 text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.55)]"
          >
            The Identity Layer<br />
            <span className="bg-gradient-to-r from-[#69A0FF] via-[#8DB8FF] to-cyan-300 bg-clip-text text-transparent">
              for AI Agents
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-200 max-w-2xl mb-10 leading-relaxed drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
          >
            Discover, verify, and rate AI agents across 20+ EVM chains.
            Every agent has a verifiable on-chain identity and cross-chain reputation score.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-4"
          >
            <button
              onClick={scrollToExplorer}
              className="px-8 py-3.5 bg-[#0052FF] hover:bg-[#0045D8] text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-[#0052FF]/30 hover:shadow-[#0052FF]/50 hover:-translate-y-0.5 text-sm"
            >
              Explore Agents →
            </button>
            <button
              onClick={() => setRegisterOpen(true)}
              className="px-8 py-3.5 border border-white/20 hover:border-white/40 text-white font-semibold rounded-xl transition-all duration-200 backdrop-blur-sm hover:bg-white/5 text-sm"
            >
              + Register My Agent
            </button>
          </motion.div>

          {/* Chain logos strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-16 flex items-center gap-3 flex-wrap justify-center"
          >
            {CHAIN_LOGOS.map((c) => (
              <button
                key={c.label}
                title={c.label}
                onClick={() => {
                  handleChainSelect(c.id);
                  scrollToExplorer();
                }}
                className={`relative flex items-center gap-1.5 transition-all duration-200 ${
                  selectedChain === c.id
                    ? "opacity-100 scale-110"
                    : "opacity-60 hover:opacity-100 hover:scale-105"
                }`}
              >
                <span className="absolute inset-0 -m-1 rounded-lg bg-white/15 blur-md pointer-events-none" />
                <img src={c.src} alt={c.label} className="w-5 h-5 rounded-none relative drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── LIVE STATS ────────────────────────────────────────────────── */}
      <StatsBar />

      {/* ─── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="bg-gray-50/70 border-y border-gray-100 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-[#0052FF] mb-3 block">How It Works</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
              The full lifecycle of an AI agent
            </h2>
            <p className="mt-3 text-gray-500 max-w-xl mx-auto">
              From registration to reputation — everything happens transparently on-chain.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-6 flex flex-col gap-4 group hover:-translate-y-1"
              >
                <div className={`w-11 h-11 rounded-xl ${f.bg} ${f.text} flex items-center justify-center`}>
                  {f.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-bold ${f.text} bg-gradient-to-r ${f.accent} bg-clip-text text-transparent`}>
                      0{i + 1}
                    </span>
                    <h3 className="text-base font-semibold text-gray-900">{f.title}</h3>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ABOUT KYA ─────────────────────────────────────────────────── */}
      <section className="py-20 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-[#0052FF] mb-3 block">ERC-8004</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight mb-5">
              Know Your Agent<br />
              <span className="text-[#0052FF]">KYA Standard</span>
            </h2>
            <p className="text-gray-500 leading-relaxed mb-6">
              KYA (Know Your Agent) aggregates identity and reputation from ERC-8004 registries across all major EVM chains.
              Every agent gets a unified cross-chain profile — one address, many chains, one reputation score.
            </p>
            <div className="flex flex-col gap-3">
              {[
                "Cross-chain agent identity resolution",
                "Immutable on-chain reputation history",
                "Verifiable feedback from real users",
                "20+ EVM networks supported",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                  <div className="w-5 h-5 rounded-full bg-[#0052FF]/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-[#0052FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  {item}
                </div>
              ))}
            </div>
            <a
              href="https://registrai-web.pages.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#0052FF] hover:underline"
            >
              Learn more about RegistrAI
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-2 gap-4"
          >
            {[
              { label: "Total Agents", value: 6265, suffix: "" },
              { label: "EVM Chains", value: 20, suffix: "+" },
              { label: "On-chain Reviews", value: 5537, suffix: "" },
              { label: "Avg Trust Score", value: 72, suffix: "%" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-6 shadow-sm"
              >
                <p className="text-3xl font-bold text-gray-900 mb-1">
                  <AnimatedCounter target={stat.value} />
                  {stat.suffix}
                </p>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── EXPLORER ──────────────────────────────────────────────────── */}
      <section ref={explorerRef} className="bg-gray-50/60 border-t border-gray-100 py-16">
        <div className="max-w-7xl mx-auto px-6">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10"
          >
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-[#0052FF] mb-2 block">Live Data</span>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Agent Explorer</h2>
              <p className="text-gray-500 text-sm mt-1">Browse verified AI agents indexed across all supported chains.</p>
            </div>
            <button
              onClick={() => setRegisterOpen(true)}
              className="px-5 py-2.5 bg-[#0052FF] hover:bg-[#0045D8] text-white font-semibold rounded-xl transition-all duration-200 text-sm shadow-md shadow-[#0052FF]/20 self-start md:self-auto flex-shrink-0"
            >
              + Register My Agent
            </button>
          </motion.div>

          {/* Chain filter pills */}
          <div className="flex flex-wrap gap-2 mb-8">
            {CHAINS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleChainSelect(id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
                  selectedChain === id
                    ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Sidebar */}
            <aside className="w-full md:w-56 flex-shrink-0 flex flex-col gap-4">
              {/* Search */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Search</p>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="0x address..."
                  className="rounded-xl text-sm border-gray-200 font-mono h-9"
                />
              </div>

              {/* Score filter */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Min Score</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {SCORE_PRESETS.map(({ label, value }) => (
                    <button
                      key={label}
                      onClick={() => setMinScore(value)}
                      className={`py-1.5 rounded-lg text-sm font-medium transition-all ${
                        minScore === value
                          ? "bg-gray-900 text-white"
                          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info card */}
              <div className="bg-gradient-to-br from-[#0052FF]/5 to-violet-50 rounded-2xl border border-[#0052FF]/10 p-4">
                <p className="text-xs font-semibold text-gray-700 mb-1.5">About KYA</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Cross-chain agent identity via ERC-8004 registries across 20+ networks.
                </p>
                <a
                  href="https://registrai-web.pages.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 text-xs font-semibold text-[#0052FF] hover:underline flex items-center gap-1"
                >
                  RegistrAI.cc ↗
                </a>
              </div>
            </aside>

            {/* Grid */}
            <main className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">
                  {loading
                    ? "Loading agents..."
                    : `${filteredAgents.length} agent${filteredAgents.length !== 1 ? "s" : ""}${selectedChain !== "all" ? ` on ${selectedChain}` : ""}`}
                </p>
              </div>
              <AgentGrid
                agents={filteredAgents}
                loading={loading}
                loadingMore={loadingMore}
                hasMore={hasMore}
                error={error}
                onLoadMore={loadMore}
              />
            </main>
          </div>
        </div>
      </section>

      {/* ─── BOTTOM CTA ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a0a1a] via-[#0c1a3a] to-[#0a0a1a] text-white py-20">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,82,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,82,255,0.06)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-0 right-1/3 w-80 h-80 bg-[#0052FF]/15 rounded-full blur-[100px]" />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0052FF]/40 bg-[#0052FF]/10 px-3.5 py-1 text-xs font-semibold text-[#4C8FFF] mb-6">
              Get Started Today
            </span>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight text-white">
              Give your agent a<br />
              <span className="bg-gradient-to-r from-[#69A0FF] via-[#8DB8FF] to-cyan-300 bg-clip-text text-transparent">
                verified identity
              </span>
            </h2>
            <p className="text-slate-200 mb-10 text-lg">
              Register your AI agent on-chain in seconds. One identity, trusted across every chain.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setRegisterOpen(true)}
                className="px-8 py-3.5 bg-[#0052FF] hover:bg-[#0045D8] text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-[#0052FF]/30 text-sm hover:-translate-y-0.5"
              >
                + Register My Agent
              </button>
              <a
                href="https://registrai-web.pages.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 border border-white/20 hover:border-white/40 text-white font-semibold rounded-xl transition-all duration-200 text-sm hover:bg-white/5"
              >
                Visit RegistrAI ↗
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <RegisterAgentModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}
