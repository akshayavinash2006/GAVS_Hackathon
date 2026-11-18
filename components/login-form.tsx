"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./actions";
import { btn, input } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/login", { body: { username, password } });
          router.push("/dashboard");
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <input className={input} placeholder="Username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required />
      <div className="relative">
        <input
          className={input + " pr-11"}
          placeholder="Password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-3" aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}
      <button className={btn.primary + " w-full"} disabled={busy || !username || !password}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
      </button>
    </form>
  );
}
