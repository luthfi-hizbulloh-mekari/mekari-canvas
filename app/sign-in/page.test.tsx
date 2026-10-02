import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: vi.fn() } },
}));

import SignInPage from "@/app/sign-in/page";

describe("sign-in page", () => {
  it("names Mekari sign-in and points agents at the read subcommand", () => {
    const markup = renderToStaticMarkup(<SignInPage />);

    expect(markup).toContain("Mekari sign-in");
    expect(markup).not.toContain("Publisher sign-in");
    expect(markup).toContain("/mekari-canvas read");
  });
});
