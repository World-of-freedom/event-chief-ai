import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { AuthBrand, AuthLayout } from "@/components/AuthLayout";
import { LoadingState } from "@/components/LoadingState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function UpdatePasswordPage() {
  const { configured, isLoading, session, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  if (!configured) return <Navigate to="/auth" replace />;
  if (isLoading) return <LoadingState fullScreen label="Verifying your reset link…" />;
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
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <AuthBrand />
          <div className="space-y-1">
            <CardTitle className="text-2xl">{complete ? "Password updated" : "Set a new password"}</CardTitle>
            <CardDescription>{complete ? "Your account is secured. Continue to your workspace." : "Use a strong password you do not use elsewhere."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {complete ? (
            <Button asChild className="w-full">
              <Link to="/">Continue to workspace</Link>
            </Button>
          ) : (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
                  <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} />
                </Field>
                {error ? (
                  <Alert variant="destructive" className="border-destructive/30 bg-destructive-soft">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <Spinner /> : null}
                  {pending ? "Updating…" : "Update password"}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
