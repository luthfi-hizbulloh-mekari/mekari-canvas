"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AddSkillPanel from "@/components/AddSkillPanel";
import ConnectedTokens from "@/components/ConnectedTokens";
import MyShares, { type ServerShare } from "@/components/MyShares";
import Logo from "@/components/Logo";
import PublishPanel, { type EditTarget } from "@/components/PublishPanel";
import { authClient } from "@/lib/auth-client";
import type { Draft } from "@/lib/draft";
import { publishDraft } from "@/lib/publish-draft";
import { detectTextArtifactKind, validateTextArtifact } from "@/lib/validate";

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

type Publisher = {
  email: string;
  viaDevBypass: boolean;
};

type PublisherIdentity = "loading" | Publisher | "anonymous";

function usePublisherIdentity(): PublisherIdentity {
  const [identity, setIdentity] = useState<PublisherIdentity>("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setIdentity("anonymous");
          return;
        }
        setIdentity((await response.json()) as Publisher);
      })
      .catch(() => {
        if (active) setIdentity("anonymous");
      });
    return () => {
      active = false;
    };
  }, []);

  return identity;
}

export default function Page() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sharesError, setSharesError] = useState("");
  const [publishedSlug, setPublishedSlug] = useState("");
  const [shares, setShares] = useState<ServerShare[]>([]);
  const [legacyEditTokens, setLegacyEditTokens] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const identity = usePublisherIdentity();
  const publisher = typeof identity === "object" ? identity : null;
  const publisherEmail = publisher?.email ?? "";
  const signedIn = publisher !== null;
  const viaDevBypass = publisher?.viaDevBypass ?? false;

  const origin = typeof location !== "undefined" ? location.origin : "";
  const shortLink = publishedSlug ? `${origin}/s/${publishedSlug}` : "";
  const scrambled = useScramble(shortLink);

  const loadShares = useCallback(async () => {
    if (identity === "loading") return;
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
  }, [identity, signedIn]);

  useEffect(() => {
    setLegacyEditTokens(loadLegacyEditTokens());
  }, []);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  const rejectKindMismatch = useCallback(
    (kind: Draft["kind"]) => {
      if (!editTarget || kind === editTarget.kind) return false;
      setError(`Artifact kind must remain ${editTarget.kind} on Edit`);
      return true;
    },
    [editTarget]
  );

  const acceptText = useCallback(
    (text: string, source: string) => {
      const kind = detectTextArtifactKind(text, source);
      if (rejectKindMismatch(kind)) return;
      setDraft({ kind, source, text });
      setPublishedSlug("");
      setError("");
      setPasteOpen(false);
    },
    [rejectKindMismatch]
  );

  const readFile = useCallback(
    (file: File) => {
      if (file.name.toLowerCase().endsWith(".zip")) {
        if (rejectKindMismatch("trace")) return;
        setDraft({ kind: "trace", source: file.name, file });
        setPublishedSlug("");
        setError("");
        setPasteOpen(false);
        return;
      }
      file.text().then((text) => acceptText(text, file.name));
    },
    [acceptText, rejectKindMismatch]
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
      const kind = detectTextArtifactKind(text);
      if (kind === "html" && !validateTextArtifact(text, kind)) {
        acceptText(text, "clipboard");
      }
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
  }, [acceptText, readFile]);

  const startEdit = useCallback((share: ServerShare) => {
    setEditTarget({
      slug: share.slug,
      kind: share.kind,
      title: share.title,
      legacy: share.legacy,
    });
    setTitle(share.title ?? "");
    setPublishedSlug("");
    setDraft(null);
    setError("");
  }, []);

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      const slug = editTarget?.slug;
      const editToken = slug ? legacyEditTokens[slug] : undefined;
      if (editTarget?.legacy === true && !editToken) {
        setError("No Browser edit token for that legacy Share in this browser");
        return;
      }

      if (!draft && !editTarget) return;
      const data = await publishDraft(draft, {
        editSlug: slug,
        editToken,
        title,
      });

      if (typeof data.editToken === "string" && data.slug) {
        saveLegacyEditToken(data.slug, data.editToken);
        setLegacyEditTokens(loadLegacyEditTokens());
      }

      await loadShares();
      setPublishedSlug(data.slug);
      setDraft(null);
      setEditTarget(null);
      setTitle("");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Network error");
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

  const discardPanel = () => {
    setDraft(null);
    setEditTarget(null);
    setTitle("");
    setError("");
  };

  const armed = editTarget !== null || draft !== null;

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
          {signedIn && !viaDevBypass && (
            <button className="ghost" onClick={signOut}>
              sign out
            </button>
          )}
        </span>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept=".html,.htm,.md,.zip,text/html,text/markdown,application/zip"
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
              <span className="key">drop .html/.md/trace.zip</span>
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
                      const pastedKind = detectTextArtifactKind(text);
                      if (!validateTextArtifact(text, pastedKind)) {
                        e.preventDefault();
                        acceptText(text, "pasted");
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <PublishPanel
            draft={draft}
            editTarget={editTarget}
            title={title}
            busy={busy}
            error={error}
            onTitleChange={setTitle}
            onChooseArtifact={() => fileInput.current?.click()}
            onPublish={publish}
            onDiscard={discardPanel}
          />
        )}
      </main>

      <ConnectedTokens signedIn={signedIn} />
      <MyShares
        shares={shares}
        origin={origin}
        legacyEditTokens={legacyEditTokens}
        onEdit={startEdit}
        onDelete={remove}
        onCopy={copy}
        error={sharesError}
      />

    </div>
  );
}
