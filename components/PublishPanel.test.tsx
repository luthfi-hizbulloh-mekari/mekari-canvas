import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PublishPanel, { type EditTarget } from "@/components/PublishPanel";

const editTarget: EditTarget = {
  slug: "abc12345",
  kind: "md",
  title: "Existing Title",
};

function render(title: string): string {
  return renderToStaticMarkup(
    <PublishPanel
      draft={null}
      editTarget={editTarget}
      title={title}
      busy={false}
      error=""
      onTitleChange={vi.fn()}
      onChooseArtifact={vi.fn()}
      onPublish={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
}

describe("PublishPanel Edit state", () => {
  it("allows a save with no new Artifact", () => {
    const markup = render("Existing Title");

    expect(markup).toContain("Artifact unchanged");
    expect(markup).toMatch(/<button class="publish">save<\/button>/);
  });

  it("blocks a Title over 120 Unicode characters", () => {
    const markup = render("🧪".repeat(121));

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("Title must be 120 characters or fewer");
    expect(markup).toMatch(/<button class="publish" disabled="">save<\/button>/);
  });
});
