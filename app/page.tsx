"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AddSkillPanel from "@/components/AddSkillPanel";
import ConnectedTokens from "@/components/ConnectedTokens";
import MyShares, { type ServerShare } from "@/components/MyShares";
import Logo from "@/components/Logo";
import { authClient } from "@/lib/auth-client";
import type { ArtifactKind } from "@/lib/artifact-kind";
import {
  MAX_ARTIFACT_BYTES,
  artifactBytes,
  detectArtifactKind,
  validateArtifact,
} from "@/lib/validate";

const LEGACY_TOKENS_KEY = "canvas.legacy-edit-tokens";

function loadLegacyEditTokens(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_TOKENS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLegacyEditToken(slug: string, editToken: string) {
  const tokens = loadLegacyEditTokens();
  tokens[slug] = editToken;
  localStorage.setItem(LEGACY_TOKENS_KEY, JSON.stringify(tokens));
}

function removeLegacyEditToken(slug: string) {
  const tokens = loadLegacyEditTokens();
  delete tokens[slug];
  localStorage.setItem(LEGACY_TOKENS_KEY, JSON.stringify(tokens));
}

const SCRAMBLE = "abcdefghijklmnopqrstuvwxyz0123456789_-";

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
  const [sharesError, setSharesError] = useState("");
  const [publishedSlug, setPublishedSlug] = useState("");
  const [shares, setShares] = useState<ServerShare[]>([]);
  const [legacyEditTokens, setLegacyEditTokens] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: session } = authClient.useSession();
  const publisherEmail = session?.user?.email ?? "";
  const signedIn = Boolean(publisherEmail);

  const origin = typeof location !== "undefined" ? location.origin : "";
  const shortLink = publishedSlug ? `${origin}/s/${publishedSlug}` : "";
  const scrambled = useScramble(shortLink);

  const byteLength = artifactBytes(content);
  const isWithinSizeCap = byteLength <= MAX_ARTIFACT_BYTES;
  const validationError = content ? validateArtifact(content, kind) : "Artifact required";
  const artifactOk = content.length > 0 && isWithinSizeCap && validationError === null;
  const statusLabel = validationLabel(validationError, kind, isWithinSizeCap);

  const loadShares = useCallback(async () => {
    if (!signedIn) {
      setShares([]);
      return;
    }
    setSharesError("");
    try {
      const res = await fetch("/api/shares");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSharesError(data.error || "Could not load shares");
        return;
      }
      const data = await res.json();
      setShares(Array.isArray(data.shares) ? data.shares : []);
    } catch {
      setSharesError("Network error loading shares");
    }
  }, [signedIn]);

  useEffect(() => {
    setLegacyEditTokens(loadLegacyEditTokens());
  }, []);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

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
      const targetShare = slug ? shares.find((s) => s.slug === slug) : undefined;
      const editToken = slug ? legacyEditTokens[slug] : undefined;
      if (slug && targetShare?.legacy === true && !editToken) {
        setError("No Browser edit token for that legacy Share in this browser");
        return;
      }

      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          kind,
          replaceSlug: slug || undefined,
          editToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Publish failed");
        return;
      }

      if (typeof data.editToken === "string" && data.slug) {
        saveLegacyEditToken(data.slug, data.editToken);
        setLegacyEditTokens(loadLegacyEditTokens());
      }

      await loadShares();
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

  const remove = async (share: ServerShare) => {
    if (!confirm(`Delete /s/${share.slug}? The Short link will 404.`)) return;
    setSharesError("");
    const headers: Record<string, string> = {};
    if (share.legacy) {
      const token = legacyEditTokens[share.slug];
      if (!token) {
        setSharesError("No Browser edit token for that legacy Share");
        return;
      }
      headers["x-edit-token"] = token;
    }
    const res = await fetch(`/api/shares/${share.slug}`, { method: "DELETE", headers });
    if (res.ok || res.status === 404) {
      removeLegacyEditToken(share.slug);
      setLegacyEditTokens(loadLegacyEditTokens());
      await loadShares();
      if (publishedSlug === share.slug) setPublishedSlug("");
    } else {
      const data = await res.json().catch(() => ({}));
      setSharesError(data.error || "Delete failed");
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
          <AddSkillPanel signedIn={signedIn} />
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

      <ConnectedTokens signedIn={signedIn} />
      <MyShares
        shares={shares}
        origin={origin}
        legacyEditTokens={legacyEditTokens}
        onReplace={startReplace}
        onDelete={remove}
        onCopy={copy}
        error={sharesError}
      />

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
