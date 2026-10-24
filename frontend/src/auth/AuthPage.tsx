import { useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { AuthBrand, AuthLayout } from "@/components/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    return (
      <AuthLayout visual={<>Connect once.<br />Keep the workspace focused.</>}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <p className="text-xs font-semibold text-primary">Configuration required</p>
            <CardTitle className="text-xl">Connect Supabase to continue</CardTitle>
            <CardDescription>
              Add your project URL and publishable key to <code className="text-primary">frontend/.env</code>, restart Vite, then come back to sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">VITE_SUPABASE_URL=https://your-project.supabase.co{"\n"}VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…</pre>
            <p className="text-xs text-muted-foreground">Use a publishable or legacy anon key only. Never put a service-role key in the browser.</p>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  const isPasswordRequired = mode !== "forgot-password";
  const heading = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your workspace" : "Reset your password";
  const subheading = mode === "sign-in" ? "Sign in to manage your event sponsorship work." : mode === "sign-up" ? "Start with a secure organizer account." : "We’ll send a secure password-reset link to your inbox.";
  const submitLabel = mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link";

  return (
    <AuthLayout visual={<>Organize what matters.<br />Secure support with confidence.</>}>
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <AuthBrand />
          <div className="space-y-1">
            <CardTitle className="text-2xl">{heading}</CardTitle>
            <CardDescription>{subheading}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {mode !== "forgot-password" ? (
            <Tabs value={mode} onValueChange={(value) => switchMode(value as AuthMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                <TabsTrigger value="sign-up">Create account</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="auth-email">Email address</FieldLabel>
                <Input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" />
              </Field>
              {isPasswordRequired ? (
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="auth-password">Password</FieldLabel>
                    {mode === "sign-in" ? (
                      <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => switchMode("forgot-password")}>
                        Forgot your password?
                      </Button>
                    ) : null}
                  </div>
                  <Input id="auth-password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} placeholder="At least 8 characters" />
                </Field>
              ) : null}

              {error ? (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive-soft">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {notice ? (
                <Alert role="status" className="border-success/30 bg-success-soft text-success">
                  <AlertDescription className="text-success">{notice}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Spinner /> : null}
                {pending ? "Please wait…" : submitLabel}
              </Button>
            </FieldGroup>
          </form>

          {mode === "forgot-password" ? (
            <Button type="button" variant="link" className="w-full" onClick={() => switchMode("sign-in")}>Back to sign in</Button>
          ) : null}
          {mode === "sign-up" ? <p className="text-xs text-muted-foreground">If email confirmation is enabled, you'll need to verify this address before you can sign in.</p> : null}
          {returnPath !== "/" && mode === "sign-in" ? <p className="text-xs text-muted-foreground">Sign in to return to the page you requested.</p> : null}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
