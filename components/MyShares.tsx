"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
import type { ArtifactKind } from "@/lib/artifact-kind";
import { formatBytes } from "@/lib/format-bytes";

export type ServerShare = {
  slug: string;
  title?: string;
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
  onEdit: (share: ServerShare) => void;
  onDelete: (share: ServerShare) => void;
  onCopy: (text: string) => void;
  error?: string;
};

export default function MyShares({
  shares,
  origin,
  legacyEditTokens,
  onEdit,
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
            {s.title || `/s/${s.slug}`}
          </a>
          <span className="when">
            {new Date(s.updatedAt || s.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            })}{" "}
            · {s.kind}
            {s.kind === "trace" ? ` · ${formatBytes(s.size)}` : ""}
            {!s.publishedBy ? " · legacy" : ""}
            {s.expiresAt
              ? ` · expires ${new Date(s.expiresAt).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}`
              : ""}
            {s.legacy && !legacyEditTokens[s.slug] ? " · no edit token" : ""}
          </span>
          <button
            className="op"
            title="copy link"
            aria-label={`copy link to /s/${s.slug}`}
            onClick={() => onCopy(`${origin}/s/${s.slug}`)}
          >
            <Copy size={14} />
          </button>
          <button
            className="op"
            title="edit"
            aria-label={`edit ${s.title || `/s/${s.slug}`}`}
            onClick={() => onEdit(s)}
          >
            <Pencil size={14} />
          </button>
          <button
            className="op danger"
            title="delete"
            aria-label={`delete /s/${s.slug}`}
            onClick={() => onDelete(s)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </section>
  );
}
