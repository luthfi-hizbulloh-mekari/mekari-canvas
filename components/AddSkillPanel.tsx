"use client";

import { useState } from "react";

type SetupState = {
  code: string;
  expiresAt: string;
  manifestUrl: string;
  guideUrl: string;
};

type Props = {
  signedIn: boolean;
};

function cursorDeepLink(prompt: string): string {
  return `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`;
}

function buildSetupPrompt(setup: SetupState): string {
  return [
    "Set up Mekari Canvas agent publish (/mekari-canvas skill):",
    "",
    `1. Fetch manifest: ${setup.manifestUrl}`,
    `2. Download manifest.files[] to ~/.cursor/skills/mekari-canvas/`,
    `3. POST ${new URL(setup.manifestUrl).origin}/api/setup/exchange`,
    `   Body: { "code": "${setup.code}", "label": "Cursor" }`,
    "4. Save token to ~/.canvas/config.json",
    "5. Run: ~/.cursor/skills/mekari-canvas/scripts/mekari-canvas.sh list",
  ].join("\n");
}

export default function AddSkillPanel({ signedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [copied, setCopied] = useState(false);

  const mint = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/setup/code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not mint setup code");
        return;
      }
      const next: SetupState = {
        code: data.code,
        expiresAt: data.expiresAt,
        manifestUrl: data.manifestUrl,
        guideUrl: data.guideUrl,
      };
      setSetup(next);
      setOpen(true);

      const prompt = buildSetupPrompt(next);
      const link = cursorDeepLink(prompt);
      window.location.href = link;
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const copyBlock = () => {
    if (!setup) return;
    const text = [
      buildSetupPrompt(setup),
      "",
      `Guide: ${setup.guideUrl}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  if (!signedIn) return null;

  return (
    <div className="agent-setup">
      <button className="ghost add-skill" disabled={busy} onClick={mint}>
        {busy ? "minting…" : "add skill"}
      </button>

      {open && setup && (
        <div className="setup-panel panel">
          <div className="setup-header">
            <span className="label">agent setup</span>
            <button className="ghost" onClick={() => setOpen(false)}>
              close
            </button>
          </div>
          <p className="setup-hint">
            Setup code expires {new Date(setup.expiresAt).toLocaleTimeString()}. If Cursor
            did not open, copy the block below into your agent.
          </p>
          <pre className="setup-block">{buildSetupPrompt(setup)}</pre>
          <div className="setup-actions">
            <button className="ghost" onClick={copyBlock}>
              {copied ? "copied" : "copy setup block"}
            </button>
            <a className="ghost" href={setup.guideUrl} target="_blank" rel="noreferrer">
              guide
            </a>
          </div>
        </div>
      )}

      {error && <div className="error setup-error">{error}</div>}
    </div>
  );
}
