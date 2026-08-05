import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublisherEmail: vi.fn(),
  getStorage: vi.fn(),
  receiveTraceUpload: vi.fn(),
}));

vi.mock("@/lib/publisher-session", () => ({
  getPublisherEmail: mocks.getPublisherEmail,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: mocks.getStorage,
}));

import { PUT } from "@/app/api/trace-uploads/[uploadId]/route";

const uploadId = "123456789012345678901";

function uploadRequest(): Request {
  return new Request(`http://localhost/api/trace-uploads/${uploadId}`, {
    method: "PUT",
    headers: { "content-type": "application/zip" },
    body: Uint8Array.from([1, 2, 3]),
  });
}

describe("local staged trace PUT", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getStorage.mockReturnValue({ receiveTraceUpload: mocks.receiveTraceUpload });
  });

  it("authorizes before validating or writing the upload", async () => {
    mocks.getPublisherEmail.mockResolvedValue(null);

    const response = await PUT(uploadRequest(), {
      params: Promise.resolve({ uploadId: "invalid" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.getStorage).not.toHaveBeenCalled();
    expect(mocks.receiveTraceUpload).not.toHaveBeenCalled();
  });

  it("accepts the local upload only for an authenticated Publisher", async () => {
    mocks.getPublisherEmail.mockResolvedValue("publisher@mekari.com");
    mocks.receiveTraceUpload.mockResolvedValue(undefined);

    const response = await PUT(uploadRequest(), {
      params: Promise.resolve({ uploadId }),
    });

    expect(response.status).toBe(201);
    expect(mocks.receiveTraceUpload).toHaveBeenCalledOnce();
  });
});
