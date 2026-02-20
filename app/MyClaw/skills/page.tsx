"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

interface Lesson {
  id: string;
  title: string;
  difficulty: string;
}

interface Discipline {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
  certificationPrice: string;
  badge: string;
}

interface CatalogResponse {
  disciplines: Discipline[];
  total_lessons: number;
}

const DISCIPLINE_META: Record<string, { icon: string; color: string; border: string; bg: string }> = {
  trading: { icon: "📈", color: "from-emerald-500 to-green-600", border: "border-emerald-200", bg: "bg-emerald-50" },
  defi: { icon: "💎", color: "from-blue-500 to-[#0052FF]", border: "border-blue-200", bg: "bg-blue-50" },
  security: { icon: "🛡️", color: "from-red-500 to-rose-600", border: "border-red-200", bg: "bg-red-50" },
  social: { icon: "🌐", color: "from-violet-500 to-purple-600", border: "border-violet-200", bg: "bg-violet-50" },
  creative: { icon: "🎨", color: "from-amber-500 to-orange-500", border: "border-amber-200", bg: "bg-amber-50" },
};

const DIFFICULTY_BADGE: Record<string, string> = {
  beginner: "bg-emerald-50 text-emerald-700 border-emerald-200",
  intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  advanced: "bg-red-50 text-red-700 border-red-200",
  expert: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function SkillsPage() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/myclaw/catalog")
      .then((r) => r.json())
      .then((data) => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="text-5xl animate-pulse">🦞</span>
          <span className="text-sm text-slate-400">Loading disciplines...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <Link href="/MyClaw" className="text-sm text-slate-400 hover:text-red-500 transition-colors mb-8 inline-block">
          ← Back to MyClaw
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">🦞</span>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Disciplines</h1>
          </div>
          <p className="text-slate-500 max-w-2xl">
            {catalog?.total_lessons ?? 0} lessons across {catalog?.disciplines.length ?? 0} disciplines.
            Each lesson costs $0.001 USDC via x402. Complete all lessons and pass the certification test to earn
            a soulbound certificate NFT.
          </p>
        </motion.div>

        <div className="flex flex-col gap-6">
          {catalog?.disciplines.map((d, i) => {
            const meta = DISCIPLINE_META[d.id] ?? DISCIPLINE_META.trading;
            const isOpen = expanded === d.id;

            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`bg-white rounded-2xl border ${meta.border} shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  className="w-full text-left p-6 flex items-start gap-4"
                >
                  <span className="text-4xl mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-xl font-bold text-slate-900">{d.title}</h2>
                      <span className={`inline-flex items-center rounded-full ${meta.bg} px-2 py-0.5 text-[10px] font-semibold border ${meta.border}`}>
                        {d.badge}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{d.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                      <span>{d.lessons.length} lessons</span>
                      <span>Cert: {d.certificationPrice}</span>
                    </div>
                  </div>
                  <span className={`text-slate-300 text-xl transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-slate-100 bg-slate-50/50 px-6 py-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {d.lessons.map((lesson, li) => (
                        <div
                          key={lesson.id}
                          className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3 hover:shadow-sm transition-shadow"
                        >
                          <span className="text-xs font-mono text-slate-300 w-6 text-right">{li + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{lesson.title}</p>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${DIFFICULTY_BADGE[lesson.difficulty] ?? ""}`}>
                            {lesson.difficulty}
                          </span>
                          <span className="text-[10px] text-slate-400">$0.001</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
