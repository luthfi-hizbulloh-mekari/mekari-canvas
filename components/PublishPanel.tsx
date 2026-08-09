"use client";

import type { ArtifactKind } from "@/lib/artifact-kind";
import { checkDraft, type Draft } from "@/lib/draft";
import { formatBytes } from "@/lib/format-bytes";
import { validateTitle } from "@/lib/validate";

export type EditTarget = {
  slug: string;
  kind: ArtifactKind;
  title?: string;
  legacy?: boolean;
};

type Props = {
  draft: Draft | null;
  editTarget: EditTarget | null;
  title: string;
  busy: boolean;
  error: string;
  onTitleChange: (title: string) => void;
  onChooseArtifact: () => void;
  onPublish: () => void;
  onDiscard: () => void;
};

export default function PublishPanel({
  draft,
  editTarget,
  title,
  busy,
  error,
  onTitleChange,
  onChooseArtifact,
  onPublish,
  onDiscard,
}: Props) {
  const draftCheck = checkDraft(draft);
  const titleValidation = validateTitle(title);
  const editing = editTarget !== null;
  const ready = titleValidation.ok && (editing ? !draft || draftCheck.ok : draftCheck.ok);

  return (
    <div className="panel">
      <div className="meta">
        <span>
          {draft
            ? `${draft.source} · ${draft.kind}`
            : `/s/${editTarget?.slug} · ${editTarget?.kind}`}
        </span>
        <span>
          {draft ? (
            <>
              {formatBytes(draftCheck.bytes)}{" "}
              <span className={draftCheck.ok ? "ok" : "bad"}>{draftCheck.label}</span>
            </>
          ) : (
            <span className="ok">Artifact unchanged</span>
          )}
        </span>
      </div>

      <div className="field">
        <label htmlFor="share-title">title — optional</label>
        <input
          id="share-title"
          value={title}
          placeholder="short purpose phrase"
          onChange={(event) => onTitleChange(event.target.value)}
          aria-invalid={!titleValidation.ok}
        />
      </div>

      <div className="artifact-choice">
        <span>{editing ? "drop or choose an optional same-kind Artifact" : "choose a different Artifact"}</span>
        <button type="button" className="ghost" onClick={onChooseArtifact}>
          choose Artifact
        </button>
      </div>

      <div className="actions">
        <button className="publish" disabled={busy || !ready} onClick={onPublish}>
          {busy ? (editing ? "saving…" : "publishing…") : editing ? "save" : "publish"}
        </button>
        <button className="ghost" onClick={onDiscard}>
          {editing ? "cancel" : "discard"}
        </button>
      </div>

      {!titleValidation.ok && <div className="error">{titleValidation.error}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
