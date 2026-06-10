"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";

type MyShare = { slug: string; editToken: string; createdAt: string };

const GATE_KEY = "canvas.gate";
const SHARES_KEY = "canvas.shares";
const SCRAMBLE = "abcdefghijklmnopqrstuvwxyz0123456789_-";

function loadShares(): MyShare[] {
  try {
    return JSON.parse(localStorage.getItem(SHARES_KEY) || "[]");
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
  const [html, setHtml] = useState("");
  const [source, setSource] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [orgCode, setOrgCode] = useState("");
  const [orgCodeSaved, setOrgCodeSaved] = useState(false);
  const [replaceSlug, setReplaceSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publishedSlug, setPublishedSlug] = useState("");
  const [shares, setShares] = useState<MyShare[]>([]);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const origin = typeof location !== "undefined" ? location.origin : "";
  const shortLink = publishedSlug ? `${origin}/s/${publishedSlug}` : "";
  const scrambled = useScramble(shortLink);

  const sizeOk = html.length > 0 && new Blob([html]).size <= 500 * 1024;
  const docOk = /<html|<!doctype/i.test(html.slice(0, 2048));

  useEffect(() => {
    setShares(loadShares());
    const saved = localStorage.getItem(GATE_KEY);
    if (saved) {
      setOrgCode(saved);
      setOrgCodeSaved(true);
    }
  }, []);

  const accept = useCallback((content: string, name: string) => {
    setHtml(content);
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
      if (/<html|<!doctype/i.test(text)) accept(text, "clipboard");
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
    setHtml("");
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
        headers: { "content-type": "application/json", "x-upload-gate": orgCode },
        body: JSON.stringify({ html, replaceSlug: slug || undefined, editToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Publish failed");
        return;
      }
      localStorage.setItem(GATE_KEY, orgCode);
      setOrgCodeSaved(true);
      if (!data.replaced) {
        const next = [
          { slug: data.slug, editToken: data.editToken, createdAt: new Date().toISOString() },
          ...shares,
        ];
        setShares(next);
        saveShares(next);
      }
      setPublishedSlug(data.slug);
      setHtml("");
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
      headers: { "x-upload-gate": orgCode, "x-edit-token": share.editToken },
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

  const armed = html.length > 0;

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
        <span>
          <span className={`status-dot${orgCodeSaved ? " open" : ""}`} />
          {orgCodeSaved ? "org code set" : "org code needed"}
        </span>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept=".html,.htm,text/html"
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
              <span className="key">drop .html</span>
              <span className="sep">/</span>
              <span className="key">⌘V</span>
              <span className="sep">/</span>
              <button onClick={() => setPasteOpen((v) => !v)}>paste raw</button>
            </div>
            {pasteOpen && (
              <div className="panel" style={{ marginTop: 40 }}>
                <div className="field" style={{ marginTop: 0 }}>
                  <label>raw html</label>
                  <textarea
                    autoFocus
                    placeholder="<!DOCTYPE html>…"
                    onChange={(e) => {
                      if (/<html|<!doctype/i.test(e.target.value)) {
                        accept(e.target.value, "pasted");
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {replaceSlug && (
              <div className="replace-banner">
                replacing /s/{parseReplaceSlug(replaceSlug)} — drop or paste html
                <button type="button" onClick={() => setReplaceSlug("")}>
                  cancel
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="panel">
            <div className="meta">
              <span>{source}</span>
              <span>
                {formatBytes(new Blob([html]).size)}{" "}
                <span className={sizeOk && docOk ? "ok" : "bad"}>
                  {!docOk ? "× not html" : !sizeOk ? "× over 500kb" : "✓ valid"}
                </span>
              </span>
            </div>

            {!orgCodeSaved && (
              <div className="field">
                <label>organization code</label>
                <input
                  type="password"
                  value={orgCode}
                  placeholder="your org code — once per browser"
                  onChange={(e) => setOrgCode(e.target.value)}
                />
              </div>
            )}

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
                disabled={busy || !sizeOk || !docOk || !orgCode}
                onClick={publish}
              >
                {busy ? "publishing…" : replaceSlug.trim() ? "replace" : "publish"}
              </button>
              <button className="ghost" onClick={() => setHtml("")}>
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
                })}
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
            "paste html — get a permanent link — no drafts — no logins — ".repeat(4)
          ).join("")}
        </span>
      </div>
    </div>
  );
}
