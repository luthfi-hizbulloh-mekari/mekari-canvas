"use client";

import { useState } from "react";
import Logo from "@/components/Logo";
import { authClient } from "@/lib/auth-client";
import { safeReturnPath } from "@/lib/sign-in-return";

export default function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    setBusy(true);
    setError("");
    const { error: signInError } = await authClient.signIn.social({
      provider: "google",
      // Not useSearchParams: it would need a Suspense boundary for static prerender.
      callbackURL: safeReturnPath(
        new URLSearchParams(window.location.search).get("callbackURL")
      ),
    });
    if (signInError) {
      setError(signInError.message || "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="noise" />
      <header className="topbar">
        <span className="brand">
          <Logo size={15} color="#fff" />
          mekari<i>®</i> canvas
        </span>
      </header>

      <main className="sign-in-stage">
        <h1 className="sign-in-title">Mekari sign-in</h1>
        <p className="sign-in-copy">Google Workspace · @mekari.com only</p>
        <button className="sign-in-google" disabled={busy} onClick={signIn}>
          {busy ? "redirecting…" : "Continue with Google"}
        </button>
        {error && <div className="error">{error}</div>}
        <p className="sign-in-agent-hint">Agents: read Canvas links with /mekari-canvas read.</p>
      </main>
    </div>
  );
}
