"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? "Authentication failed.");
        return;
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <KeyRound size={20} />
          </div>
          <div>
            <p className="eyebrow">Mailbox intelligence</p>
            <h1>Email thread scraper</h1>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
            Create account
          </button>
        </div>

        <form className="stack-form" onSubmit={onSubmit}>
          {mode === "signup" ? (
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
            </label>
          ) : null}
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={pending}>
            <LogIn size={16} />
            {pending ? "Working" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
