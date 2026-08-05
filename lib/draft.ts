import { ARTIFACT_KIND, type TextArtifactKind } from "@/lib/artifact-kind";
import { artifactBytes, validateTextArtifact } from "@/lib/validate";

export type Draft =
  | { kind: TextArtifactKind; source: string; text: string }
  | { kind: "trace"; source: string; file: File };

export type DraftCheck = { ok: boolean; bytes: number; label: string };

function capLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)}mb` : `${bytes / 1024}kb`;
}

export function checkDraft(draft: Draft | null): DraftCheck {
  if (!draft) return { ok: false, bytes: 0, label: "Artifact required" };

  const bytes = draft.kind === "trace" ? draft.file.size : artifactBytes(draft.text);
  const maxBytes = ARTIFACT_KIND[draft.kind].maxBytes;
  if (bytes > maxBytes) {
    return { ok: false, bytes, label: `× over ${capLabel(maxBytes)}` };
  }

  if (draft.kind === "trace") {
    return { ok: true, bytes, label: "✓ ready" };
  }

  const error = validateTextArtifact(draft.text, draft.kind);
  if (!error) return { ok: true, bytes, label: "✓ valid" };
  return {
    ok: false,
    bytes,
    label: draft.kind === "html" ? "× not html" : "× empty md",
  };
}
