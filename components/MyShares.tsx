"use client";

import type { ArtifactKind } from "@/lib/artifact-kind";
import { formatBytes } from "@/lib/format-bytes";

export type ServerShare = {
  slug: string;
  kind: ArtifactKind;
  createdAt: string;
  updatedAt: string;
  size: number;
  publishedBy?: string;
  expiresAt?: string | null;
  legacy?: boolean;
};

type Props = {
  shares: ServerShare[];
  origin: string;
  legacyEditTokens: Record<string, string>;
  onReplace: (slug: string) => void;
  onDelete: (share: ServerShare) => void;
  onCopy: (text: string) => void;
  error?: string;
};

export default function MyShares({
  shares,
  origin,
  legacyEditTokens,
  onReplace,
  onDelete,
  onCopy,
  error,
}: Props) {
  if (shares.length === 0) return null;

  return (
    <section className="shares">
      <h2>my shares</h2>
      {error && <div className="error shares-error">{error}</div>}
      {shares.map((s) => (
        <div className="share-row" key={s.slug}>
          <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer">
            /s/{s.slug}
          </a>
          <span className="when">
            {new Date(s.updatedAt || s.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })}{" "}
            · {s.kind}
            {s.kind === "trace" ? ` · ${formatBytes(s.size)}` : ""}
            {s.publishedBy ? ` · ${s.publishedBy}` : " · legacy"}
            {s.expiresAt
              ? ` · expires ${new Date(s.expiresAt).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}`
              : ""}
            {s.legacy && !legacyEditTokens[s.slug] ? " · no edit token" : ""}
          </span>
          <button className="op" onClick={() => onCopy(`${origin}/s/${s.slug}`)}>
            copy
          </button>
          <button className="op" onClick={() => onReplace(s.slug)}>
            replace
          </button>
          <button className="op danger" onClick={() => onDelete(s)}>
            delete
          </button>
        </div>
      ))}
    </section>
  );
}
