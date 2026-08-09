import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve("public/setup/skill/scripts/mekari-canvas.sh");
const temporaryHomes: string[] = [];

async function makeHome(config?: Record<string, unknown>) {
  const home = await mkdtemp(path.join(tmpdir(), "mekari-canvas-setup-"));
  temporaryHomes.push(home);
  if (config) {
    await mkdir(path.join(home, ".canvas"), { recursive: true });
    await writeFile(
      path.join(home, ".canvas", "config.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      { mode: 0o644 }
    );
  }
  return home;
}

async function readConfig(home: string) {
  return JSON.parse(await readFile(path.join(home, ".canvas", "config.json"), "utf8"));
}

async function runSetup(home: string, manifestUrl: string) {
  return execFileAsync("bash", [SCRIPT, "setup", "fresh-code", manifestUrl], {
    env: { ...process.env, HOME: home },
  });
}

async function runCanvas(home: string, ...args: string[]) {
  return execFileAsync("bash", [SCRIPT, ...args], {
    env: { ...process.env, HOME: home },
  });
}

function readRequestBody(request: IncomingMessage, done: (body: string) => void) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => done(body));
}

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
) {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true })));
});

describe("mekari-canvas setup", () => {
  it("exchanges the Setup code when config is missing", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        if (request.url === "/api/setup/exchange" && request.method === "POST") {
          exchangeCalls += 1;
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ token: "new-token", apiBase: `http://${address}` }));
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome();

        await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(exchangeCalls).toBe(1);
        expect(await readConfig(home)).toEqual({ apiBase: baseUrl, token: "new-token" });
        expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
          0o600
        );
        await expect(stat(path.join(home, ".cursor", "skills"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    );
  });

  it("reuses a valid token without exchanging the new Setup code", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/api/shares") {
          expect(request.headers.authorization).toBe("Bearer existing-token");
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"shares":[]}');
          return;
        }
        exchangeCalls += 1;
        response.writeHead(500).end();
      },
      async (baseUrl) => {
        const home = await makeHome({
          apiBase: baseUrl,
          token: "existing-token",
          unrelated: { keep: true },
        });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stdout).toContain("Existing Publisher API token is valid");
        expect(exchangeCalls).toBe(0);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "existing-token",
          unrelated: { keep: true },
        });
        expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
          0o600
        );
      }
    );
  });

  it("exchanges a rejected token and preserves unrelated config fields", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/api/shares") {
          response.writeHead(401, { "content-type": "application/json" });
          response.end('{"error":"rejected"}');
          return;
        }
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        if (request.url === "/api/setup/exchange" && request.method === "POST") {
          exchangeCalls += 1;
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({ token: "replacement-token", apiBase: `http://${address}` })
          );
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({
          apiBase: baseUrl,
          token: "rejected-token",
          theme: "dark",
        });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stderr).toContain("token was rejected");
        expect(exchangeCalls).toBe(1);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "replacement-token",
          theme: "dark",
        });
        expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
          0o600
        );
      }
    );
  });

  it("preserves a token when validation fails in transport", async () => {
    const home = await makeHome({
      apiBase: "http://127.0.0.1:1",
      token: "possibly-valid-token",
      custom: "preserve-me",
    });

    const result = await runSetup(home, "http://127.0.0.1:1/setup/manifest.json");

    expect(result.stderr).toContain("Could not validate");
    expect(result.stderr).toContain("Setup code was not exchanged");
    expect(await readConfig(home)).toEqual({
      apiBase: "http://127.0.0.1:1",
      token: "possibly-valid-token",
      custom: "preserve-me",
    });
    expect((await stat(path.join(home, ".canvas", "config.json"))).mode & 0o777).toBe(
      0o600
    );
  });

  it("preserves a token when validation returns a transient server error", async () => {
    let requests = 0;
    await withServer(
      (request, response) => {
        requests += 1;
        expect(request.url).toBe("/api/shares");
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":"temporarily unavailable"}');
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "existing-token" });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stderr).toContain("Could not validate");
        expect(requests).toBe(1);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "existing-token",
        });
      }
    );
  });

  it("repairs an invalid saved API base by exchanging the Setup code", async () => {
    let exchangeCalls = 0;
    await withServer(
      (request, response) => {
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        if (request.url === "/api/setup/exchange") {
          exchangeCalls += 1;
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ token: "repaired-token", apiBase: `http://${address}` }));
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({
          apiBase: "not-a-url",
          token: "stranded-token",
          unrelated: true,
        });

        const result = await runSetup(home, `${baseUrl}/setup/manifest.json`);

        expect(result.stderr).toContain("invalid API base");
        expect(exchangeCalls).toBe(1);
        expect(await readConfig(home)).toEqual({
          apiBase: baseUrl,
          token: "repaired-token",
          unrelated: true,
        });
      }
    );
  });

  it("reports a stable error when the exchange response is not JSON", async () => {
    await withServer(
      (request, response) => {
        if (request.url === "/setup/manifest.json") {
          const address = request.headers.host;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              apiBase: `http://${address}`,
              exchangeUrl: "/api/setup/exchange",
            })
          );
          return;
        }
        response.writeHead(502, { "content-type": "text/plain" });
        response.end("upstream failed");
      },
      async (baseUrl) => {
        const home = await makeHome();

        await expect(
          runSetup(home, `${baseUrl}/setup/manifest.json`)
        ).rejects.toMatchObject({
          stderr: expect.stringContaining("setup exchange failed (HTTP 502)"),
        });
      }
    );
  });
});

describe("mekari-canvas publish helper", () => {
  it("lists formatted shares with exactly one API request", async () => {
    let requests = 0;
    await withServer(
      (request, response) => {
        requests += 1;
        expect(request.url).toBe("/api/shares");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            shares: [
              {
                slug: "release-notes",
                kind: "md",
                updatedAt: "2026-08-10",
                expiresAt: null,
              },
            ],
          })
        );
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });

        const result = await runCanvas(home, "list");

        expect(result.stdout.trim().split(/\s+/)).toEqual([
          "release-notes",
          "md",
          "2026-08-10",
          "permanent",
        ]);
        expect(requests).toBe(1);
      }
    );
  });

  it("reports a non-empty HTTP 500 error when delete fails", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end('{"error":"delete unavailable"}');
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });

        await expect(runCanvas(home, "delete", "old-share")).rejects.toMatchObject({
          stderr: expect.stringMatching(/\S.*500|500.*\S/),
        });
      }
    );
  });

  it("includes curl diagnostics when an API transport fails", async () => {
    await withServer(
      (request) => {
        request.socket.destroy();
      },
      async (baseUrl) => {
        const token = "secret-bearer-token";
        const home = await makeHome({ apiBase: baseUrl, token });

        try {
          await runCanvas(home, "delete", "old-share");
          throw new Error("Expected delete to fail");
        } catch (error) {
          const stderr = String((error as { stderr?: string }).stderr ?? "");
          expect(stderr).toContain("request failed (HTTP 000; DELETE /api/shares/old-share)");
          expect(stderr).toMatch(/curl: \(\d+\) /);
          expect(stderr).not.toContain(token);
        }
      }
    );
  });

  it("uses a stable fallback for a non-JSON publish failure", async () => {
    await withServer(
      (request, response) => {
        expect(request.url).toBe("/api/publish");
        readRequestBody(request, () => {
          response.writeHead(502, { "content-type": "text/plain" });
          response.end("upstream failed");
        });
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const file = path.join(home, "share.md");
        await writeFile(file, "# Share\n");

        await expect(runCanvas(home, "publish", "--new", file)).rejects.toMatchObject({
          stderr: expect.stringContaining("publish failed (HTTP 502)"),
        });
      }
    );
  });

  it("includes curl diagnostics when publish transport fails", async () => {
    await withServer(
      (request) => {
        request.socket.destroy();
      },
      async (baseUrl) => {
        const token = "secret-bearer-token";
        const home = await makeHome({ apiBase: baseUrl, token });
        const file = path.join(home, "share.md");
        await writeFile(file, "# Share\n");

        try {
          await runCanvas(home, "publish", "--new", file);
          throw new Error("Expected publish to fail");
        } catch (error) {
          const stderr = String((error as { stderr?: string }).stderr ?? "");
          expect(stderr).toContain("publish failed (HTTP 000; POST /api/publish)");
          expect(stderr).toMatch(/curl: \(\d+\) /);
          expect(stderr).not.toContain(token);
        }
      }
    );
  });

  it("re-stages an expired trace replacement before retrying without replaceSlug", async () => {
    let mintCalls = 0;
    const commits: Array<Record<string, unknown>> = [];
    await withServer(
      (request, response) => {
        if (request.url === "/api/trace-uploads" && request.method === "POST") {
          mintCalls += 1;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              uploadId: `upload-${mintCalls}`,
              uploadUrl: `http://${request.headers.host}/uploads/${mintCalls}`,
            })
          );
          return;
        }
        if (request.url?.startsWith("/uploads/") && request.method === "PUT") {
          request.resume();
          request.on("end", () => response.writeHead(200).end());
          return;
        }
        if (request.url === "/api/publish" && request.method === "POST") {
          readRequestBody(request, (body) => {
            commits.push(JSON.parse(body));
            if (commits.length === 1) {
              response.writeHead(404, { "content-type": "application/json" });
              response.end('{"error":"missing","code":"share_not_found"}');
            } else {
              response.writeHead(200, { "content-type": "application/json" });
              response.end('{"slug":"replacement"}');
            }
          });
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const file = path.join(home, "recording.zip");
        await writeFile(file, "trace bytes");
        await writeFile(
          path.join(home, ".canvas", "publish-manifest.json"),
          JSON.stringify({ [file]: "expired-share" })
        );

        const result = await runCanvas(home, "publish", file);

        expect(result.stdout).toContain(`${baseUrl}/s/replacement`);
        expect(mintCalls).toBe(2);
        expect(commits).toEqual([
          { kind: "trace", uploadId: "upload-1", replaceSlug: "expired-share" },
          { kind: "trace", uploadId: "upload-2" },
        ]);
      }
    );
  });

  it("does not expose a signed URL when the direct trace upload fails", async () => {
    let signedUploadUrl = "";
    await withServer(
      (request, response) => {
        if (request.url === "/api/trace-uploads") {
          signedUploadUrl = `http://${request.headers.host}/signed-upload?signature=secret`;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ uploadId: "upload-1", uploadUrl: signedUploadUrl }));
          return;
        }
        if (request.url === "/signed-upload?signature=secret") {
          request.resume();
          request.on("end", () => response.writeHead(500).end("upload failed"));
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const file = path.join(home, "recording.zip");
        await writeFile(file, "trace bytes");

        try {
          await runCanvas(home, "publish", "--new", file);
          throw new Error("Expected trace upload to fail");
        } catch (error) {
          const stderr = String((error as { stderr?: string }).stderr ?? "");
          expect(stderr).toContain("trace upload failed (HTTP 500)");
          expect(stderr.trim()).not.toBe("");
          expect(stderr).not.toContain(signedUploadUrl);
        }
      }
    );
  });

  it("keeps direct trace-upload transport errors free of signed URLs", async () => {
    let signedUploadUrl = "";
    await withServer(
      (request, response) => {
        if (request.url === "/api/trace-uploads") {
          signedUploadUrl = `http://${request.headers.host}/signed-upload?signature=secret`;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ uploadId: "upload-1", uploadUrl: signedUploadUrl }));
          return;
        }
        if (request.url === "/signed-upload?signature=secret") {
          request.socket.destroy();
          return;
        }
        response.writeHead(404).end();
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const file = path.join(home, "recording.zip");
        await writeFile(file, "trace bytes");

        try {
          await runCanvas(home, "publish", "--new", file);
          throw new Error("Expected trace upload to fail");
        } catch (error) {
          const stderr = String((error as { stderr?: string }).stderr ?? "");
          expect(stderr).toContain("trace upload failed (HTTP 000)");
          expect(stderr).not.toContain(signedUploadUrl);
        }
      }
    );
  });

  it("reports the HTTP status when trace-upload minting fails", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":"mint unavailable"}');
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const file = path.join(home, "recording.zip");
        await writeFile(file, "trace bytes");

        await expect(runCanvas(home, "publish", "--new", file)).rejects.toMatchObject({
          stderr: expect.stringContaining("503"),
        });
      }
    );
  });

  it("round-trips manifest paths containing quotes and backslashes", async () => {
    await withServer(
      (request, response) => {
        readRequestBody(request, () => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"slug":"quoted-path"}');
        });
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const file = path.join(home, 'share"\\notes.md');
        await writeFile(file, "# Share\n");

        await runCanvas(home, "publish", "--new", file);

        const manifest = JSON.parse(
          await readFile(path.join(home, ".canvas", "publish-manifest.json"), "utf8")
        );
        expect(manifest).toEqual({ [file]: "quoted-path" });
      }
    );
  });

  it("keeps the previous manifest when jq cannot update it", async () => {
    await withServer(
      (request, response) => {
        readRequestBody(request, () => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end('{"slug":"not-written"}');
        });
      },
      async (baseUrl) => {
        const home = await makeHome({ apiBase: baseUrl, token: "test-token" });
        const file = path.join(home, "share.md");
        const manifestFile = path.join(home, ".canvas", "publish-manifest.json");
        const previousManifest = "{broken manifest\n";
        await writeFile(file, "# Share\n");
        await writeFile(manifestFile, previousManifest);

        await expect(runCanvas(home, "publish", "--new", file)).rejects.toMatchObject({
          stderr: expect.stringContaining("could not update"),
        });
        expect(await readFile(manifestFile, "utf8")).toBe(previousManifest);
      }
    );
  });
});
