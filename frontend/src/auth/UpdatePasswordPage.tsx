import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { AuthLayout } from "@/components/AuthLayout";

export function UpdatePasswordPage() {
  const { configured, isLoading, session, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  if (!configured) return <Navigate to="/auth" replace />;
  if (isLoading) return <div className="app-loading">Verifying your reset link…</div>;
  if (!session) return <Navigate to="/auth" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Choose a password with at least 8 characters.");
    if (password !== confirmation) return setError("The passwords do not match.");
    setPending(true);
    try {
      await updatePassword(password);
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout visual={<>A fresh password.<br />The same focused workspace.</>}>
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">EC</span>
          <span>Event Chief AI</span>
        </div>
        <div className="auth-copy">
          <h1>{complete ? "Password updated" : "Set a new password"}</h1>
          <p>{complete ? "Your account is secured. Continue to your workspace." : "Use a strong password you do not use elsewhere."}</p>
        </div>
        {complete ? (
          <a className="button auth-submit" href="/">Continue to workspace</a>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>New password</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
            </label>
            <label>
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} />
            </label>
            {error ? <p className="auth-message error" role="alert">{error}</p> : null}
            <button className="button auth-submit" disabled={pending}>{pending ? "Updating…" : "Update password"}</button>
          </form>
        )}
      </section>
    </AuthLayout>
  );
}
