import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MyShares, { type ServerShare } from "@/components/MyShares";

const common = {
  kind: "trace" as const,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  size: 1_000_000,
  publishedBy: "publisher@mekari.com",
};

function render(shares: ServerShare[]): string {
  return renderToStaticMarkup(
    <MyShares
      shares={shares}
      origin="https://canvas.example"
      legacyEditTokens={{}}
      onReplace={vi.fn()}
      onDelete={vi.fn()}
      onCopy={vi.fn()}
    />
  );
}

describe("MyShares trace metadata", () => {
  it("renders decimal trace size and a present expiration", () => {
    const markup = render([
      {
        ...common,
        slug: "expiring",
        expiresAt: "2026-08-12T00:00:00.000Z",
      },
    ]);

    expect(markup).toContain("1.0 MB");
    expect(markup).toContain("expires");
    expect(markup).not.toContain(common.publishedBy);
  });

  it("renders trace size without expiration text for a permanent trace", () => {
    const markup = render([{ ...common, slug: "permanent", expiresAt: null }]);

    expect(markup).toContain("1.0 MB");
    expect(markup).not.toContain("expires");
  });
});
