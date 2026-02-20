"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAgent } from "../hooks/useAgent";
import { useFeedback } from "../hooks/useFeedback";
import { KYATrustBadge } from "../components/KYATrustBadge";
import { ChainBadge } from "../components/ChainBadge";
import { ReputationChart } from "../components/ReputationChart";
import { FeedbackList } from "../components/FeedbackList";
import { FeedbackForm } from "../components/FeedbackForm";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PageProps {
  params: { agentId: string };
}

function shortAddress(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function AgentDetailPage({ params }: PageProps) {
  const decodedId = decodeURIComponent(params.agentId);

  const { agent, reputation, history, loading, error } = useAgent(decodedId);
  const { feedback, loading: feedbackLoading, hasMore, loadMore, refresh } = useFeedback(decodedId);

  const ownerAddress = (agent as any)?.ownerAddress ?? decodedId;
  const masterAgentId = (agent as any)?.masterAgentId ?? decodedId;
  const chains: string[] = (agent as any)?.chains ?? (agent as any)?.identities?.map((i: any) => i.chain) ?? [];
  const identities: any[] = (agent as any)?.identities ?? [];
  const unifiedScore = (reputation as any)?.unified?.value ?? (reputation as any)?.score ?? 0;
  const feedbackCount = (reputation as any)?.unified?.totalFeedbackCount ?? feedback.length;

  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 text-sm">Agent not found or API unavailable.</p>
        <Link href="/MyAgents" className="text-[#0052FF] text-sm hover:underline">
          ← Back to Agentic Hub
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Back nav */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link
            href="/MyAgents"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Agentic Hub
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-start gap-6 mb-8"
        >
          {/* Avatar */}
          {loading ? (
            <Skeleton className="w-16 h-16 rounded-2xl flex-shrink-0" />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-xl"
              style={{
                backgroundColor: `hsl(${parseInt(ownerAddress.slice(2, 6), 16) % 360}, 65%, 50%)`,
              }}
            >
              {ownerAddress.slice(2, 4).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-64 rounded" />
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl font-bold text-gray-900 font-mono">
                    {shortAddress(ownerAddress)}
                  </h1>
                  <button
                    onClick={() => navigator.clipboard.writeText(ownerAddress)}
                    className="text-gray-300 hover:text-gray-500 transition-colors"
                    title="Copy address"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>

                {masterAgentId !== ownerAddress && (
                  <p className="text-xs text-gray-400 font-mono mb-2">
                    masterAgentId: {shortAddress(masterAgentId)}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <KYATrustBadge agentId={decodedId} size="md" />
                  {chains.slice(0, 5).map((chain) => (
                    <ChainBadge key={chain} chain={chain} size="sm" />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Stats pills */}
          <div className="flex gap-4 md:flex-col md:items-end">
            <div className="text-center md:text-right">
              <p className="text-2xl font-bold text-gray-900">
                {loading ? <Skeleton className="h-8 w-16 rounded inline-block" /> : (unifiedScore > 0 ? "+" : "") + unifiedScore}
              </p>
              <p className="text-xs text-gray-400">Reputation</p>
            </div>
            <div className="text-center md:text-right">
              <p className="text-2xl font-bold text-gray-900">
                {loading ? <Skeleton className="h-8 w-10 rounded inline-block" /> : feedbackCount}
              </p>
              <p className="text-xs text-gray-400">Reviews</p>
            </div>
          </div>
        </motion.div>

        <Separator className="bg-gray-100 mb-8" />

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: tabs */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Tabs defaultValue="overview">
              <TabsList className="bg-gray-100 rounded-xl p-1 w-full md:w-auto">
                <TabsTrigger value="overview" className="rounded-lg text-sm">Overview</TabsTrigger>
                <TabsTrigger value="chains" className="rounded-lg text-sm">Chains</TabsTrigger>
                <TabsTrigger value="reviews" className="rounded-lg text-sm">
                  Reviews {feedbackCount > 0 && `(${feedbackCount})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
                <ReputationChart history={history} />

                {/* Per-chain reputation table */}
                {reputation && (reputation as any).perChain?.length > 0 && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 border-gray-100">
                          <TableHead className="text-xs text-gray-400 font-medium">Chain</TableHead>
                          <TableHead className="text-xs text-gray-400 font-medium text-right">Score</TableHead>
                          <TableHead className="text-xs text-gray-400 font-medium text-right">Reviews</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reputation as any).perChain.map((row: any) => (
                          <TableRow key={row.chain ?? row.chainId} className="border-gray-50">
                            <TableCell>
                              <ChainBadge chain={row.chain ?? row.chainName ?? String(row.chainId)} size="sm" />
                            </TableCell>
                            <TableCell className="text-right text-sm font-mono">
                              {row.value ?? row.score ?? 0}
                            </TableCell>
                            <TableCell className="text-right text-sm text-gray-500">
                              {row.totalFeedbackCount ?? row.feedbackCount ?? 0}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="chains" className="mt-4">
                {loading ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
                  </div>
                ) : identities.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {identities.map((identity: any, i: number) => (
                      <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ChainBadge chain={identity.chain ?? identity.chainName ?? String(identity.chainId)} size="sm" />
                          <span className="text-xs font-mono text-gray-500">
                            {shortAddress(identity.agentId ?? identity.contractAddress ?? identity.id ?? "")}
                          </span>
                        </div>
                        {identity.registeredAt && (
                          <span className="text-xs text-gray-400">
                            {new Date(identity.registeredAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-8 text-center">
                    <p className="text-sm text-gray-400">No chain identities found</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reviews" className="mt-4">
                <FeedbackList
                  feedback={feedback}
                  loading={feedbackLoading}
                  hasMore={hasMore}
                  onLoadMore={loadMore}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: feedback form + links */}
          <div className="flex flex-col gap-4">
            <FeedbackForm agentId={decodedId} onSuccess={refresh} />

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-600">External Links</p>
              <a
                href={`https://registrai-web.pages.dev/?q=${decodedId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[#0052FF] hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on RegistrAI Explorer
              </a>
              <a
                href={`https://basescan.org/address/${ownerAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-[#0052FF] hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Basescan
              </a>
            </div>

            <p className="text-[10px] text-gray-400 text-center">
              Powered by{" "}
              <a href="https://registrai-web.pages.dev/" target="_blank" rel="noopener noreferrer" className="text-[#0052FF] hover:underline">
                KYA · RegistrAI
              </a>{" "}
              · ERC-8004
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
