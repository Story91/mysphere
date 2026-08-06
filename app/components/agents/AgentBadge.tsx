"use client";

/**
 * AgentBadge - wskaznik przy autorze posta.
 *
 * ZASADY (pozycja 1.4 z REDEFINICJA.md):
 * - CZLOWIEK NIE DOSTAJE ODZNAKI. Domyslny stan nie wymaga etykiety, a
 *   oznaczanie kazdego autora zaszumiloby feed i odebralo odznace agenta
 *   cala jej wartosc informacyjna.
 * - AGENT dostaje wyrazna odznake "Agent" + trust score z KYA.
 * - LADOWANIE NIE PRZESUWA LAYOUTU: dopoki KYA nie odpowie, komponent nie
 *   renderuje NICZEGO (zamiast szkieletu/spinnera - ten musialby zajac
 *   miejsce przy KAZDYM autorze, wiec przy 150 postach byloby 150 pustych
 *   plakietek, ktore potem znikaja i przesuwaja cala kolumne).
 *
 * DANE POCHODZA Z PROPSA, NIE Z WLASNEGO ZAPYTANIA.
 * Swiadomie NIE reuzywamy app/MyAgents/components/KYATrustBadge.tsx: tamten
 * komponent robi wlasne kya.isAgentTrusted() w useEffect, wiec w feedzie
 * oznaczalby jedno zapytanie HTTP na post. Przejmujemy natomiast jego jezyk
 * wizualny (zielona pigulka, ikona tarczy z checkiem, format "· score",
 * link do eksploratora registr.ai) i jego progi zaufania, zeby odznaka w
 * feedzie i odznaka w rejestrze znaczyly to samo.
 */

import React from "react";
import type { AgentInfo } from "./useAgentLookup";

interface AgentBadgeProps {
  /** Dane agenta z useAgentLookup. null/undefined => czlowiek albo brak odpowiedzi. */
  agent?: AgentInfo | null;
  /** Czy zapytanie do KYA jest jeszcze w locie. */
  loading?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Tarcza z checkiem - ta sama ikona, co w KYATrustBadge. */
function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Prosty znacznik agenta dla pozycji jeszcze bez potwierdzonej reputacji. */
function AgentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 4v4M9 14h.01M15 14h.01" />
    </svg>
  );
}

/** Score bywa ulamkowy po przeliczeniu decimals - w pigulce chcemy liczbe calkowita. */
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function AgentBadge({ agent, loading = false, size = "sm", className = "" }: AgentBadgeProps) {
  // Brak odpowiedzi z KYA -> nic. Feed wyglada dokladnie jak przed zmiana.
  if (loading) return null;
  // Czlowiek (albo adres spoza rejestru) -> brak odznaki. To jest cala regula.
  if (!agent) return null;

  const sizing = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  const iconSize = size === "md" ? "w-3.5 h-3.5" : "w-3 h-3";
  const hasScore = agent.score !== null;

  const label = hasScore && agent.trusted ? `Agent · ${formatScore(agent.score as number)}` : "Agent";

  const tone = agent.trusted
    ? "bg-soft-accent-soft text-soft-accent-deep border-soft-accent/60"
    : "bg-soft-sunken text-soft-primary-deep border-soft-line";

  const title = agent.trusted
    ? `KYA verified agent — score ${formatScore(agent.score as number)} from ${agent.feedbackCount} onchain reviews`
    : hasScore
      ? `Registered agent (KYA) — score ${formatScore(agent.score as number)}, ${agent.feedbackCount} reviews`
      : "Registered agent (KYA) — no reputation yet";

  const content = (
    <>
      {agent.trusted ? (
        <VerifiedIcon className={`${iconSize} flex-shrink-0`} />
      ) : (
        <AgentIcon className={`${iconSize} flex-shrink-0`} />
      )}
      <span className="font-soft-display font-semibold whitespace-nowrap">{label}</span>
    </>
  );

  const shared = `inline-flex items-center gap-1 ml-2 rounded-pill border font-soft shadow-chip ${sizing} ${tone} ${className}`;

  if (!agent.agentId) {
    return (
      <span className={shared} title={title}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={`https://registrai-web.pages.dev/?q=${encodeURIComponent(agent.agentId)}`}
      target="_blank"
      rel="noopener noreferrer"
      // Naglowek posta ma wlasne handlery - klik w odznake nie ma ich odpalac.
      onClick={(e) => e.stopPropagation()}
      title={title}
      className={`${shared} transition-[filter,transform] duration-[--dur-press] ease-out-strong hover:brightness-95 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary`}
    >
      {content}
    </a>
  );
}

export default AgentBadge;
