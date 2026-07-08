"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { authClient } from "@/lib/auth-client";
import type { ArtifactKind } from "@/lib/artifact-kind";
import {
  MAX_ARTIFACT_BYTES,
  artifactBytes,
  detectArtifactKind,
  validateArtifact,
} from "@/lib/validate";

type MyShare = {
  slug: string;
  editToken: string;
  createdAt: string;
  kind: ArtifactKind;
  publishedBy?: string;
};
type StoredMyShare = Omit<MyShare, "kind"> & { kind?: ArtifactKind };

const SHARES_KEY = "canvas.shares";
const SCRAMBLE = "abcdefghijklmnopqrstuvwxyz0123456789_-";

function loadShares(): MyShare[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARES_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((share: StoredMyShare) => ({ ...share, kind: share.kind ?? "html" }));
  } catch {
    return [];
  }
}

function saveShares(shares: MyShare[]) {
  localStorage.setItem(SHARES_KEY, JSON.stringify(shares));
}

function parseReplaceSlug(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const segment = trimmed.includes("/s/") ? trimmed.split("/s/").pop() ?? "" : trimmed;
  return segment.replace(/\/+$/, "").split(/[?#]/)[0];
}

function formatBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

function validationLabel(
  error: string | null,
  kind: ArtifactKind,
  isWithinSizeCap: boolean
): string {
  if (!error) return "✓ valid";
  if (!isWithinSizeCap) return "× over 500kb";
  return kind === "html" ? "× not html" : "× empty md";
}

/** Decode-style text reveal for the freshly minted short link. */
function useScramble(target: string) {
  const [text, setText] = useState(target);
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      const settled = Math.floor(frame / 2);
      setText(
        target
          .split("")
          .map((ch, i) =>
            i < settled ? ch : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]
          )
          .join("")
      );
      if (settled >= target.length) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, [target]);
  return text;
}

function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pos = { x: innerWidth / 2, y: innerHeight / 3 };
    const cur = { ...pos };
    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
    };
    let raf = 0;
    const tick = () => {
      cur.x += (pos.x - cur.x) * 0.07;
      cur.y += (pos.y - cur.y) * 0.07;
      if (ref.current) {
        ref.current.style.left = `${cur.x}px`;
        ref.current.style.top = `${cur.y}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className="glow" />;
}

export default function Page() {
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<ArtifactKind>("html");
  const [source, setSource] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [replaceSlug, setReplaceSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publishedSlug, setPublishedSlug] = useState("");
  const [shares, setShares] = useState<MyShare[]>([]);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: session } = authClient.useSession();
  const publisherEmail = session?.user?.email ?? "";

  const origin = typeof location !== "undefined" ? location.origin : "";
  const shortLink = publishedSlug ? `${origin}/s/${publishedSlug}` : "";
  const scrambled = useScramble(shortLink);

  const byteLength = artifactBytes(content);
  const isWithinSizeCap = byteLength <= MAX_ARTIFACT_BYTES;
  const validationError = content ? validateArtifact(content, kind) : "Artifact required";
  const artifactOk = content.length > 0 && isWithinSizeCap && validationError === null;
  const statusLabel = validationLabel(validationError, kind, isWithinSizeCap);

  useEffect(() => {
    setShares(loadShares());
  }, []);

  const accept = useCallback((nextContent: string, name: string, nextKind?: ArtifactKind) => {
    setContent(nextContent);
    setKind(nextKind ?? detectArtifactKind(nextContent, name));
    setSource(name);
    setPublishedSlug("");
    setError("");
    setPasteOpen(false);
  }, []);

  const readFile = useCallback(
    (file: File) => {
      file.text().then((t) => accept(t, file.name));
    },
    [accept]
  );

  // The whole page is the drop zone; paste works anywhere too.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) readFile(file);
    };
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const text = e.clipboardData?.getData("text") || "";
      const pastedKind = detectArtifactKind(text);
      if (pastedKind === "html") accept(text, "clipboard", pastedKind);
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onPaste);
    };
  }, [accept, readFile]);

  const startReplace = useCallback((slug: string) => {
    setReplaceSlug(slug);
    setPublishedSlug("");
    setContent("");
    setKind("html");
    setSource("");
    setError("");
    requestAnimationFrame(() => fileInput.current?.click());
  }, []);

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      const slug = parseReplaceSlug(replaceSlug);
      const editToken = slug ? shares.find((s) => s.slug === slug)?.editToken : undefined;
      if (slug && !editToken) {
        setError("No edit token for that Share in this browser");
        return;
      }
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, kind, replaceSlug: slug || undefined, editToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Publish failed");
        return;
      }
      const publishedKind = data.kind as ArtifactKind;
      const publishedBy = typeof data.publishedBy === "string" ? data.publishedBy : undefined;
      if (!data.replaced) {
        const next = [
          {
            slug: data.slug,
            editToken: data.editToken,
            createdAt: new Date().toISOString(),
            kind: publishedKind,
            publishedBy,
          },
          ...shares,
        ];
        setShares(next);
        saveShares(next);
      } else {
        const next = shares.map((share) =>
          share.slug === data.slug ? { ...share, kind: publishedKind } : share
        );
        setShares(next);
        saveShares(next);
      }
      setPublishedSlug(data.slug);
      setContent("");
      setKind("html");
      setReplaceSlug("");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (share: MyShare) => {
    if (!confirm(`Delete /s/${share.slug}? The Short link will 404.`)) return;
    const res = await fetch(`/api/shares/${share.slug}`, {
      method: "DELETE",
      headers: { "x-edit-token": share.editToken },
    });
    if (res.ok || res.status === 404) {
      const next = shares.filter((s) => s.slug !== share.slug);
      setShares(next);
      saveShares(next);
      if (publishedSlug === share.slug) setPublishedSlug("");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/sign-in";
  };

  const armed = content.length > 0;

  return (
    <div className={shares.length > 0 ? "has-shares" : undefined}>
      <CursorGlow />
      <div className="noise" />
      <div className={`frame${dragging ? " dragging" : ""}`} />

      <header className="topbar">
        <span className="brand">
          <Logo size={15} color="#fff" />
          mekari<i>®</i> canvas
        </span>
        <span className="publisher-bar">
          {publisherEmail && <span className="publisher-email">{publisherEmail}</span>}
          <button className="ghost" onClick={signOut}>
            sign out
          </button>
        </span>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept=".html,.htm,.md,text/html,text/markdown"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
          e.target.value = "";
        }}
      />

      <main className="stage">
        {publishedSlug ? (
          <div className="published">
            <div className="label">{copied ? "copied" : "share is live"}</div>
            <a
              className="shortlink"
              href={shortLink}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                copy(shortLink);
              }}
            >
              {scrambled}
            </a>
            <div className="after">
              <button className="ghost" onClick={() => window.open(shortLink, "_blank")}>
                open
              </button>
              <button className="ghost" onClick={() => setPublishedSlug("")}>
                new share
              </button>
            </div>
          </div>
        ) : !armed ? (
          <>
            <h1
              className={`wordmark${dragging ? " dragging" : ""}`}
              onClick={() => fileInput.current?.click()}
            >
              CANVAS
            </h1>
            <div className="hint">
              <span className="key">drop .html/.md</span>
              <span className="sep">/</span>
              <span className="key">⌘V</span>
              <span className="sep">/</span>
              <button onClick={() => setPasteOpen((v) => !v)}>paste raw</button>
            </div>
            {pasteOpen && (
              <div className="panel" style={{ marginTop: 40 }}>
                <div className="field" style={{ marginTop: 0 }}>
                  <label>raw artifact</label>
                  <textarea
                    autoFocus
                    placeholder="<!DOCTYPE html>... or # Markdown — paste here"
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      const pastedKind = detectArtifactKind(text);
                      if (!validateArtifact(text, pastedKind)) {
                        e.preventDefault();
                        accept(text, "pasted", pastedKind);
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {replaceSlug && (
              <div className="replace-banner">
                replacing /s/{parseReplaceSlug(replaceSlug)} — drop or paste same kind
                <button type="button" onClick={() => setReplaceSlug("")}>
                  cancel
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="panel">
            <div className="meta">
              <span>
                {source} · {kind}
              </span>
              <span>
                {formatBytes(byteLength)}{" "}
                <span className={artifactOk ? "ok" : "bad"}>{statusLabel}</span>
              </span>
            </div>

            <div className="field">
              <label>replace — optional short link</label>
              <input
                value={replaceSlug}
                placeholder="leave empty for a new share"
                onChange={(e) => setReplaceSlug(e.target.value)}
                spellCheck={false}
              />
            </div>

            <div className="actions">
              <button
                className="publish"
                disabled={busy || !artifactOk}
                onClick={publish}
              >
                {busy ? "publishing…" : replaceSlug.trim() ? "replace" : "publish"}
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setContent("");
                  setKind("html");
                }}
              >
                discard
              </button>
            </div>

            {error && <div className="error">{error}</div>}
          </div>
        )}
      </main>

      {shares.length > 0 && (
        <section className="shares">
          <h2>my shares — this browser</h2>
          {shares.map((s) => (
            <div className="share-row" key={s.slug}>
              <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer">
                /s/{s.slug}
              </a>
              <span className="when">
                {new Date(s.createdAt).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}{" "}
                · {s.kind}
                {s.publishedBy ? ` · ${s.publishedBy}` : ""}
              </span>
              <button className="op" onClick={() => copy(`${origin}/s/${s.slug}`)}>
                copy
              </button>
              <button className="op" onClick={() => startReplace(s.slug)}>
                replace
              </button>
              <button className="op danger" onClick={() => remove(s)}>
                delete
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="marquee">
        <span className="track">
          {Array.from({ length: 2 }, () =>
            "paste html or md — get a permanent link — mekari publishers — no drafts — ".repeat(4)
          ).join("")}
        </span>
      </div>
    </div>
  );
}
