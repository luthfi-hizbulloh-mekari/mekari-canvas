"use client";

import { useCallback, useEffect, useState } from "react";

export type PublisherToken = {
  id: string;
  label: string;
  createdAt: string;
};

type Props = {
  signedIn: boolean;
};

export default function ConnectedTokens({ signedIn }: Props) {
  const [tokens, setTokens] = useState<PublisherToken[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!signedIn) {
      setTokens([]);
      return;
    }
    try {
      const res = await fetch("/api/tokens");
      if (!res.ok) return;
      const data = await res.json();
      setTokens(Array.isArray(data.tokens) ? data.tokens : []);
    } catch {
      /* ignore */
    }
  }, [signedIn]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (tokenId: string) => {
    if (!confirm("Revoke this token? Agent publish from that machine will stop working.")) return;
    setBusy(tokenId);
    setError("");
    try {
      const res = await fetch("/api/tokens/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Revoke failed");
        return;
      }
      await load();
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  };

  if (!signedIn || tokens.length === 0) return null;

  return (
    <section className="agent-tokens">
      <h2>connected tokens</h2>
      {error && <div className="error">{error}</div>}
      {tokens.map((t) => (
        <div className="token-row" key={t.id}>
          <span className="token-label">{t.label}</span>
          <span className="token-when">
            {new Date(t.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
          <button
            className="op danger"
            disabled={busy === t.id}
            onClick={() => revoke(t.id)}
          >
            {busy === t.id ? "…" : "revoke"}
          </button>
        </div>
      ))}
    </section>
  );
}
