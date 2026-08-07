"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ClaudeMark, CodexMark, CursorMark } from "@/components/AgentMarks";
import {
  buildSetupPrompt,
  isSkillSetupUsable,
  parseSkillSetup,
  skillSetupRemainingMs,
  type SkillSetup,
} from "@/lib/skill-distribution";

type AgentId = "cursor" | "claude-code" | "codex";
type ActionId = AgentId | "copy" | "reveal";

type Agent = {
  id: AgentId;
  name: string;
  Mark: ComponentType<{ size?: number }>;
  deepLink?: (prompt: string) => string;
};

type Feedback = {
  kind: "status" | "error";
  message: string;
};

type Props = {
  signedIn: boolean;
};

const AGENTS: Agent[] = [
  {
    id: "cursor",
    name: "Cursor",
    Mark: CursorMark,
    deepLink: (prompt) =>
      `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`,
  },
  { id: "claude-code", name: "Claude Code", Mark: ClaudeMark },
  { id: "codex", name: "Codex CLI", Mark: CodexMark },
];

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Older and permission-restricted browsers may still support execCommand.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard write failed");
}

export default function AddSkillPanel({ signedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<SkillSetup | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionId | null>(null);
  const [launchedAgent, setLaunchedAgent] = useState<AgentId | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [copied, setCopied] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const actionInProgress = useRef(false);
  const mintPromise = useRef<Promise<SkillSetup> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prompt = setup ? buildSetupPrompt(setup) : null;
  const busy = pendingAction !== null;

  const getSetup = async (): Promise<SkillSetup> => {
    if (setup && isSkillSetupUsable(setup)) return setup;
    if (mintPromise.current) return mintPromise.current;

    const request = (async () => {
      const response = await fetch("/api/setup/code", { method: "POST" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Could not create a Setup code";
        throw new Error(message);
      }

      const next = parseSkillSetup(data);
      if (!isSkillSetupUsable(next)) throw new Error("Setup code expired before use");
      setSetup(next);
      return next;
    })();
    mintPromise.current = request;

    try {
      return await request;
    } finally {
      if (mintPromise.current === request) mintPromise.current = null;
    }
  };

  const beginAction = (action: ActionId): boolean => {
    if (actionInProgress.current || (action !== "copy" && launchedAgent)) return false;
    actionInProgress.current = true;
    setPendingAction(action);
    setFeedback(null);
    return true;
  };

  const finishAction = () => {
    actionInProgress.current = false;
    setPendingAction(null);
  };

  const flagCopied = () => {
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const copyText = async (text: string, successMessage: string): Promise<void> => {
    try {
      await writeClipboard(text);
      flagCopied();
      setFeedback({ kind: "status", message: successMessage });
    } catch {
      setFeedback({
        kind: "error",
        message: "Could not copy the prompt. Select the raw prompt and copy it manually.",
      });
    }
  };

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!setup) return;
    const delay = skillSetupRemainingMs(setup);
    if (delay <= 0) {
      setSetup(null);
      return;
    }
    const timer = setTimeout(() => setSetup(null), delay);
    return () => clearTimeout(timer);
  }, [setup]);

  const copyPrompt = async () => {
    if (!beginAction("copy")) return;
    try {
      const next = await getSetup();
      await copyText(buildSetupPrompt(next), "Setup prompt copied.");
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      finishAction();
    }
  };

  const launch = async (agent: Agent) => {
    if (!beginAction(agent.id)) return;
    try {
      const next = await getSetup();
      const nextPrompt = buildSetupPrompt(next);
      setLaunchedAgent(agent.id);

      if (agent.deepLink) {
        setFeedback({
          kind: "status",
          message: `${agent.name} deep link attempted. If it did not open, copy the raw prompt below.`,
        });
        window.location.href = agent.deepLink(nextPrompt);
      } else {
        await copyText(nextPrompt, `Prompt copied. Paste it into ${agent.name}.`);
      }
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      finishAction();
    }
  };

  const revealPrompt = async () => {
    if (rawOpen) {
      setRawOpen(false);
      return;
    }
    if (!beginAction("reveal")) return;
    try {
      await getSetup();
      setRawOpen(true);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      finishAction();
    }
  };

  const startOver = () => {
    setSetup(null);
    setLaunchedAgent(null);
    setFeedback(null);
    setCopied(false);
    setRawOpen(false);
    mintPromise.current = null;
    if (copyTimer.current) clearTimeout(copyTimer.current);
  };

  if (!signedIn) return null;

  return (
    <div className="agent-setup">
      <button
        className="ghost add-skill"
        aria-expanded={open}
        aria-controls="add-skill-panel"
        onClick={() => setOpen((current) => !current)}
      >
        install skill
      </button>

      {open && (
        <section
          id="add-skill-panel"
          className="setup-panel panel"
          aria-labelledby="add-skill-title"
          aria-busy={busy}
        >
          <div className="setup-header">
            <span className="setup-heading">
              <span id="add-skill-title" className="setup-title">
                install skill
              </span>
              <span className="setup-subtitle">
                pick an agent — we mint a one-time setup prompt
              </span>
            </span>
            <button className="setup-close" aria-label="Close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div className="setup-grid" aria-label="Choose where to open the setup prompt">
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                className={`setup-tile${launchedAgent === agent.id ? " active" : ""}`}
                disabled={busy || launchedAgent !== null}
                aria-label={`${agent.deepLink ? "Open setup prompt in" : "Copy setup prompt for"} ${agent.name}`}
                onClick={() => launch(agent)}
              >
                <span className="setup-mark">
                  <agent.Mark size={22} />
                </span>
                <span className="setup-tile-name">{agent.name}</span>
                <span className="setup-tile-hint">
                  {pendingAction === agent.id
                    ? "preparing…"
                    : launchedAgent === agent.id
                      ? "launched"
                      : agent.deepLink
                        ? "deep link"
                        : "copy prompt"}
                </span>
              </button>
            ))}
          </div>

          <div className="setup-alternative">
            <span className="setup-rule" />
            <span>or</span>
            <button className="setup-copy" disabled={busy} onClick={copyPrompt}>
              {pendingAction === "copy" ? "preparing…" : copied ? "copied ✓" : "copy prompt"}
            </button>
          </div>

          <span className="setup-announcer" aria-live="polite" aria-atomic="true">
            {feedback?.message}
          </span>

          {feedback && (
            <div className={`setup-result${feedback.kind === "error" ? " error" : ""}`}>
              <span className="setup-result-dot" />
              {feedback.message}
            </div>
          )}

          <div className="setup-prompt">
            <div className="setup-prompt-header">
              <button
                className="setup-prompt-toggle"
                aria-expanded={rawOpen}
                aria-controls="setup-raw-prompt"
                disabled={busy}
                onClick={revealPrompt}
              >
                <span className={`setup-caret${rawOpen ? " open" : ""}`} aria-hidden="true">
                  ▸
                </span>
                raw prompt
              </button>
              {setup && (
                <span>expires {new Date(setup.expiresAt).toLocaleTimeString()}</span>
              )}
            </div>

            {rawOpen && prompt && (
              <textarea
                id="setup-raw-prompt"
                className="setup-prompt-body"
                readOnly
                rows={7}
                spellCheck={false}
                value={prompt}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
          </div>

          {launchedAgent && (
            <div className="setup-footer">
              <button className="ghost" onClick={startOver}>
                start over
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
