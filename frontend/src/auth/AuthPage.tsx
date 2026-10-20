import { useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

type AuthMode = "sign-in" | "sign-up" | "forgot-password";

export function AuthPage() {
  const { configured, signIn, signUp, requestPasswordReset } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const returnPath = (location.state as { from?: string } | null)?.from ?? "/";

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (mode === "sign-in") {
        await signIn(email, password);
      } else if (mode === "sign-up") {
        const result = await signUp(email, password);
        setNotice(result.emailConfirmationRequired ? "Check your inbox to confirm your account, then return here to sign in." : "Account created. Your workspace is ready.");
      } else {
        await requestPasswordReset(email);
        setNotice("If an account exists for this address, a secure reset link is on its way.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication could not be completed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (!configured) {
    return <AuthFrame><section className="auth-card setup-card"><p className="eyebrow">Configuration required</p><h1>Connect Supabase to continue</h1><p>Add your project URL and publishable key to <code>frontend/.env</code>, restart Vite, then come back to sign in.</p><pre>VITE_SUPABASE_URL=https://your-project.supabase.co{"\n"}VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…</pre><p className="auth-fine-print">Use a publishable or legacy anon key only. Never put a service-role key in the browser.</p></section></AuthFrame>;
  }

  const isPasswordRequired = mode !== "forgot-password";
  const heading = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your workspace" : "Reset your password";
  const subheading = mode === "sign-in" ? "Sign in to manage your event sponsorship work." : mode === "sign-up" ? "Start with a secure organizer account." : "We’ll send a secure password-reset link to your inbox.";

  return (
    <AuthFrame>
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark">EC</span><span>Event Chief AI</span></div>
        <div className="auth-copy"><h1>{heading}</h1><p>{subheading}</p></div>
        {mode !== "forgot-password" ? <div className="auth-tabs" role="tablist" aria-label="Authentication options"><button type="button" role="tab" aria-selected={mode === "sign-in"} className={mode === "sign-in" ? "selected" : ""} onClick={() => switchMode("sign-in")}>Sign in</button><button type="button" role="tab" aria-selected={mode === "sign-up"} className={mode === "sign-up" ? "selected" : ""} onClick={() => switchMode("sign-up")}>Create account</button></div> : null}
        <form className="auth-form" onSubmit={submit}>
          <label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" /></label>
          {isPasswordRequired ? <label><span>Password</span><input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} placeholder="At least 8 characters" /></label> : null}
          {error ? <p className="auth-message error" role="alert">{error}</p> : null}
          {notice ? <p className="auth-message success" role="status">{notice}</p> : null}
          <button className="button auth-submit" disabled={pending}>{pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link"}</button>
        </form>
        {mode === "sign-in" ? <button type="button" className="text-button" onClick={() => switchMode("forgot-password")}>Forgot your password?</button> : null}
        {mode === "forgot-password" ? <button type="button" className="text-button" onClick={() => switchMode("sign-in")}>Back to sign in</button> : null}
        {mode === "sign-up" ? <p className="auth-fine-print">By creating an account, you will be asked to verify this email before access is granted when confirmation is enabled.</p> : null}
        {returnPath !== "/" && mode === "sign-in" ? <p className="auth-fine-print">Sign in to return to the page you requested.</p> : null}
      </section>
    </AuthFrame>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  return <main className="auth-layout"><div className="auth-theme"><ThemeToggle /></div><div className="auth-visual" aria-hidden="true"><span className="auth-orb orb-one" /><span className="auth-orb orb-two" /><p>Organize what matters.<br />Secure support with confidence.</p></div><div className="auth-panel">{children}</div></main>;
}
