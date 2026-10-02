import { mkdir, readdir, readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CURRENT_SKILL_PACKAGE_VERSION } from "@/lib/skill-package-freshness";
import {
  makeHome,
  removeTemporaryHomes,
  runCanvas,
  runCanvasWith,
  withServer,
} from "@/tests/support/canvas-script";

afterEach(removeTemporaryHomes);

type SeenRequest = Pick<IncomingMessage, "method" | "url" | "headers">;

function record(requests: SeenRequest[], request: IncomingMessage) {
  requests.push({ method: request.method, url: request.url, headers: request.headers });
}

function expectAuthenticatedGet(request: SeenRequest, url: string) {
  expect(request.method).toBe("GET");
  expect(request.url).toBe(url);
  expect(request.headers.authorization).toBe("Bearer test-token");
  expect(request.headers["x-mekari-canvas-skill-version"]).toBe(CURRENT_SKILL_PACKAGE_VERSION);
}

describe("mekari-canvas read", () => {
  const body = "# PR summary\n\nTrailing newline kept.\n\n";

  it.each(["slug", "Short link"])("prints a Share body byte for byte from a %s", async (form) => {
    const requests: SeenRequest[] = [];
    await withServer(
      (request, response) => {
        record(requests, request);
        response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
        response.end(body);
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const target = form === "slug" ? "abc12345" : `${baseUrl}/s/abc12345`;

        const result = await runCanvas(home, "read", target);

        expect(result.stdout).toBe(body);
        expect(requests).toHaveLength(1);
        expectAuthenticatedGet(requests[0], "/s/abc12345");
      }
    );
  });

  it("refuses to send the token to a foreign origin", async () => {
    const requests: SeenRequest[] = [];
    await withServer(
      (request, response) => {
        record(requests, request);
        response.writeHead(200).end(body);
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });

        await expect(
          runCanvas(home, "read", "https://mekari-canvas.evil.example/s/abc12345")
        ).rejects.toMatchObject({
          stderr: expect.stringContaining(
            "refusing to send the Publisher API token to https://mekari-canvas.evil.example"
          ),
        });
        expect(requests).toHaveLength(0);
      }
    );
  });

  it("downloads a trace Share byte-exact after the viewer redirect", async () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x0a, 0xff, 0x00]);
    const requests: SeenRequest[] = [];
    await withServer(
      (request, response) => {
        record(requests, request);
        if (request.url === "/s/abc12345") {
          response.writeHead(302, { location: "https://trace.playwright.dev/?trace=x" });
          response.end();
          return;
        }
        if (request.url === "/s/abc12345/trace") {
          response.writeHead(200, { "content-type": "application/zip" });
          response.end(zip);
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const out = path.join(home, "trace.zip");

        const result = await runCanvas(home, "read", "abc12345", "--out", out);

        expect(result.stdout).toBe(`${out}\n`);
        expect(await readFile(out)).toEqual(zip);
        expect(requests.map((request) => request.url)).toEqual([
          "/s/abc12345",
          "/s/abc12345/trace",
        ]);
        expectAuthenticatedGet(requests[1], "/s/abc12345/trace");
      }
    );
  });

  it("reports the server's 401 text", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
        response.end("Mekari Canvas Shares require Mekari sign-in.\n");
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "revoked-token" });

        await expect(runCanvas(home, "read", "abc12345")).rejects.toMatchObject({
          stderr: expect.stringMatching(
            /HTTP 401.*Mekari Canvas Shares require Mekari sign-in\.[\s\S]*Add skill/
          ),
        });
      }
    );
  });

  it("writes a text Share to --out", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(body);
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const out = path.join(home, "share.md");

        const result = await runCanvas(home, "read", "--out", out, `${baseUrl}/s/abc12345/`);

        expect(result.stdout).toBe(`${out}\n`);
        expect(await readFile(out, "utf8")).toBe(body);
      }
    );
  });

  it("accepts a bare Slug that begins with a hyphen", async () => {
    const requests: SeenRequest[] = [];
    await withServer(
      (request, response) => {
        record(requests, request);
        response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
        response.end(body);
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });

        const result = await runCanvas(home, "read", "-abc1234");
        const separated = await runCanvas(home, "read", "--", "--abc123");

        expect(result.stdout).toBe(body);
        expect(separated.stdout).toBe(body);
        expect(requests.map((request) => request.url)).toEqual(["/s/-abc1234", "/s/--abc123"]);
        expectAuthenticatedGet(requests[0], "/s/-abc1234");
      }
    );
  });

  async function withTextAndTraceServer(run: (baseUrl: string) => Promise<void>) {
    await withServer((request, response) => {
      if (request.url === "/s/trace123") {
        response.writeHead(302, { location: "https://trace.playwright.dev/?trace=x" });
        response.end();
        return;
      }
      response.writeHead(200);
      response.end(request.url === "/s/trace123/trace" ? Buffer.from([0x50, 0x4b, 0x00]) : body);
    }, run);
  }

  it.each(["abc12345", "trace123"])(
    "writes %s to a hyphen-leading --out filename literally",
    async (slug) => {
      await withTextAndTraceServer(async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const tmp = path.join(home, "tmp");
        await mkdir(tmp);

        const result = await runCanvasWith(
          home,
          { cwd: home, env: { TMPDIR: tmp } },
          "read",
          slug,
          "--out",
          "-result.out"
        );

        expect(result.stdout).toBe("-result.out\n");
        expect((await readFile(path.join(home, "-result.out"))).length).toBeGreaterThan(0);
        expect(await readdir(tmp)).toEqual([]);
      });
    }
  );

  it.each([
    ["abc12345", "an existing directory", "dir"],
    ["trace123", "an existing directory", "dir"],
    ["abc12345", "an unwritable path", "missing/share.out"],
    ["trace123", "an unwritable path", "missing/share.out"],
  ])("rejects %s --out to %s and removes the downloaded body", async (slug, _label, out) => {
    await withTextAndTraceServer(async (baseUrl) => {
      const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
      const tmp = path.join(home, "tmp");
      await mkdir(tmp);
      await mkdir(path.join(home, "dir"));

      await expect(
        runCanvasWith(home, { cwd: home, env: { TMPDIR: tmp } }, "read", slug, "--out", out)
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(out === "dir" ? /not a directory: dir/ : /could not write/),
      });
      expect(await readdir(tmp)).toEqual([]);
      expect(await readdir(path.join(home, "dir"))).toEqual([]);
    });
  });
});
