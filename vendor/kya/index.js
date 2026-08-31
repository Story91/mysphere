"use strict";

/**
 * Vendored KYA (Know Your Agent) client.
 *
 * The original @registrai/kya package was unpublished from npm and the
 * hosted API (kya-api.registr.ai) is currently offline. This local
 * replacement implements the same surface documented in docs/KYA.md so
 * the app builds and works unchanged; endpoint paths follow standard
 * REST conventions and can be adjusted if the real API comes back with
 * different routes.
 */

class KYAError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "KYAError";
    this.status = status;
  }
}

class KYAClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || "https://kya-api.registr.ai").replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetch = options.fetch || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
    if (!this.fetch) {
      throw new KYAError("No fetch implementation available");
    }
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const res = await this.fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let message = `KYA API error ${res.status}`;
      try {
        const data = await res.json();
        if (data && (data.error || data.message)) message = data.error || data.message;
      } catch {}
      throw new KYAError(message, res.status);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /** Look up an agent by masterAgentId, owner address, or global agent ID. */
  getAgent(id) {
    return this.request("GET", `/agents/${encodeURIComponent(id)}`);
  }

  /** Quick trust check with configurable thresholds. */
  isAgentTrusted(id, opts = {}) {
    return this.request("GET", `/agents/${encodeURIComponent(id)}/trusted`, {
      query: { minScore: opts.minScore, minFeedback: opts.minFeedback },
    });
  }

  /** Full reputation breakdown (unified + per-chain). */
  getReputation(id) {
    return this.request("GET", `/agents/${encodeURIComponent(id)}/reputation`);
  }

  /** Historical reputation snapshots (for charts). */
  getReputationHistory(id, opts = {}) {
    return this.request("GET", `/agents/${encodeURIComponent(id)}/reputation/history`, {
      query: { limit: opts.limit, page: opts.page },
    });
  }

  /** Build on-chain feedback transaction data. Requires API key. */
  buildFeedbackTx(id, params) {
    return this.request("POST", `/agents/${encodeURIComponent(id)}/feedback/tx`, { body: params });
  }

  /** Store off-chain comment linked to an on-chain tx. Requires API key. */
  submitFeedback(id, params) {
    return this.request("POST", `/agents/${encodeURIComponent(id)}/feedback`, { body: params });
  }

  /** Get all feedback/comments for an agent. */
  getFeedback(id, opts = {}) {
    return this.request("GET", `/agents/${encodeURIComponent(id)}/feedback`, {
      query: { page: opts.page, limit: opts.limit },
    });
  }

  /** Paginated agent list, filterable by chain/network. */
  listAgents(opts = {}) {
    return this.request("GET", `/agents`, {
      query: { page: opts.page, limit: opts.limit, network: opts.network, chain: opts.chain },
    });
  }

  /** Platform-wide stats. */
  getStats(opts = {}) {
    return this.request("GET", `/stats`, { query: { network: opts.network } });
  }
}

module.exports = { KYAClient, KYAError };
