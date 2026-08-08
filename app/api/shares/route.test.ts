import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareMeta } from "@/lib/storage";

const mocks = vi.hoisted(() => ({
  getPublisherEmail: vi.fn(),
  listByPublisher: vi.fn(),
}));

vi.mock("@/lib/publisher-session", () => ({
  getPublisherEmail: mocks.getPublisherEmail,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ listByPublisher: mocks.listByPublisher }),
}));

import { GET } from "@/app/api/shares/route";

const common = {
  editTokenHash: "",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  publishedBy: "publisher@mekari.com",
};

describe("GET /api/shares expiration JSON", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getPublisherEmail.mockResolvedValue("publisher@mekari.com");
  });

  it("uses ISO for expiring traces, null for permanent traces, and omission otherwise", async () => {
    const shares: ShareMeta[] = [
      {
        ...common,
        slug: "expiring",
        kind: "trace",
        size: 1_000_000,
        expiresAt: "2030-08-12T00:00:00.000Z",
      },
      { ...common, slug: "permanent", kind: "trace", size: 999_999 },
      { ...common, slug: "htmlshare", kind: "html", size: 123 },
      { ...common, slug: "markdown", kind: "md", size: 456 },
    ];
    mocks.listByPublisher.mockResolvedValue(shares);

    const response = await GET(new Request("https://canvas.example/api/shares"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shares[0].expiresAt).toBe("2030-08-12T00:00:00.000Z");
    expect(body.shares[1].expiresAt).toBeNull();
    expect(body.shares[2]).not.toHaveProperty("expiresAt");
    expect(body.shares[3]).not.toHaveProperty("expiresAt");
  });
});
