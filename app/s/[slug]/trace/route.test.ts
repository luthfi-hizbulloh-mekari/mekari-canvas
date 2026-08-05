import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  getStorage: vi.fn(),
  loadLiveShare: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/lib/share-lookup", () => ({
  loadLiveShare: mocks.loadLiveShare,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: mocks.getStorage,
}));

import { GET, HEAD, OPTIONS } from "@/app/s/[slug]/trace/route";
import { ARTIFACT_KIND } from "@/lib/artifact-kind";
import type { ShareMeta } from "@/lib/storage";

const slug = "abc12345";
const traceSize = 4096;
const now = "2026-08-05T00:00:00.000Z";
const traceMeta: ShareMeta = {
  slug,
  kind: "trace",
  editTokenHash: "",
  createdAt: now,
  updatedAt: now,
  size: traceSize,
};
const htmlMeta: ShareMeta = { ...traceMeta, kind: "html" };

function request(method: "GET" | "HEAD" | "OPTIONS"): Request {
  return new Request(`https://canvas.example/s/${slug}/trace`, { method });
}

function params() {
  return { params: Promise.resolve({ slug }) };
}

function expectCors(response: Response) {
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
  expect(response.headers.get("access-control-allow-headers")).toBe("range");
  expect(response.headers.get("access-control-expose-headers")).toBe(
    "content-length, content-type"
  );
  expect(response.headers.get("accept-ranges")).toBe("none");
}

describe("Trace artifact route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getStorage.mockReturnValue({ open: mocks.open });
  });

  it("streams GET bytes without a declared length", async () => {
    const bytes = Uint8Array.from([80, 75, 3, 4, 1, 2, 3]);
    mocks.loadLiveShare.mockResolvedValue(traceMeta);
    mocks.open.mockResolvedValue(new Blob([bytes]).stream());

    const response = await GET(request("GET"), params());

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe(ARTIFACT_KIND.trace.contentType);
    expectCors(response);
  });

  it("reports the Canvas-recorded size and cancels the upstream stream on HEAD", async () => {
    const stream = new ReadableStream<Uint8Array>({ cancel: mocks.cancel });
    mocks.loadLiveShare.mockResolvedValue(traceMeta);
    mocks.open.mockResolvedValue(stream);

    const response = await HEAD(request("HEAD"), params());

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-length")).toBe(String(traceSize));
    expect(response.headers.get("content-type")).toBe(ARTIFACT_KIND.trace.contentType);
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expectCors(response);
  });

  it("answers OPTIONS with CORS headers and no artifact read", async () => {
    mocks.loadLiveShare.mockResolvedValue(traceMeta);

    const response = await OPTIONS(request("OPTIONS"), params());

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expectCors(response);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", GET],
    ["HEAD", HEAD],
    ["OPTIONS", OPTIONS],
  ] as const)("returns 404 for non-trace and expired Shares on %s", async (method, handler) => {
    for (const lookupResult of [htmlMeta, null]) {
      mocks.loadLiveShare.mockResolvedValueOnce(lookupResult);

      const response = await handler(request(method), params());

      expect(response.status).toBe(404);
    }
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
