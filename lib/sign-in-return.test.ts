import { describe, expect, it } from "vitest";
import { safeReturnPath, signInPathFor } from "@/lib/sign-in-return";

// Copied from Better Auth 1.6.23 originCheckMiddleware: every return path Canvas passes as a
// relative callbackURL must satisfy it, or sign-in fails with INVALID_CALLBACK_URL.
const BETTER_AUTH_RELATIVE_CALLBACK =
  /^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/;

describe("safeReturnPath", () => {
  it.each(["/", "/s/abc12345", "/s/A_b-9"])("accepts %s", (path) => {
    expect(safeReturnPath(path)).toBe(path);
    expect(BETTER_AUTH_RELATIVE_CALLBACK.test(path)).toBe(true);
  });

  it.each([
    null,
    "",
    "//evil.com",
    "/\\evil.com",
    "https://evil.com/s/x",
    "/s/../x",
    "/s/abc?x=1",
    "/%2F%2Fevil.com",
    "javascript:alert(1)",
    "/api/tokens",
  ])("falls back to / for %s", (raw) => {
    expect(safeReturnPath(raw)).toBe("/");
  });
});

describe("signInPathFor", () => {
  it("returns to the Short link after sign-in", () => {
    const path = signInPathFor("abc12345");

    expect(path).toBe("/sign-in?callbackURL=%2Fs%2Fabc12345");
    const callbackURL = new URL(path, "https://canvas.example").searchParams.get("callbackURL");
    expect(safeReturnPath(callbackURL)).toBe("/s/abc12345");
  });

  it.each(["a.b", "", "../x", "a/b", "x".repeat(65)])(
    "uses a bare sign-in page for slug %j",
    (slug) => {
      expect(signInPathFor(slug)).toBe("/sign-in");
    }
  );
});
