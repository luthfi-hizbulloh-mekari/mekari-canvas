import { describe, expect, it } from "vitest";
import { GET } from "@/app/setup/manifest.json/route";

describe("GET /setup/manifest.json", () => {
  it("uses the requesting deployment as the token exchange API", async () => {
    const response = GET(new Request("https://preview.example/setup/manifest.json"));

    await expect(response.json()).resolves.toEqual({
      version: "2.0.0",
      apiBase: "https://preview.example",
      exchangeUrl: "/api/setup/exchange",
    });
  });
});
