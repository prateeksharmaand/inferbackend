"use client";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { errorMessage } from "@/services/client";
import { authApi } from "@/services";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const cfg = useQuery({ queryKey: ["auth-config"], queryFn: authApi.config });
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await authApi.login(email, password);
      else await authApi.register(email, password, name);
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Sparkles className="size-4" /></div>
          <div><h1 className="font-semibold">CareerPilot AI</h1><p className="text-xs text-muted-foreground">Your personal job-search agent</p></div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          {mode === "register" && <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <Field label="Password" hint={mode === "register" ? "At least 10 characters" : undefined}>
            <Input type="password" required minLength={mode === "register" ? 10 : undefined} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" type="submit" loading={busy}>{mode === "login" ? "Sign in" : "Create account"}</Button>
        </form>
        {cfg.data?.registration_open && (
          <button className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "No account yet? Create one" : "Have an account? Sign in"}
          </button>
        )}
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
