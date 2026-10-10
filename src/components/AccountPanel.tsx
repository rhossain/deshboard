"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { googleEnabled, supabase } from "@/lib/supabase";
import { Avatar } from "./account";

type Step = { name: "email" } | { name: "code"; email: string; sentAt: number };

interface Profile {
  plan: string;
  plan_until: string | null;
  created_at: string;
}

const PLAN_LABEL: Record<string, string> = { free: "Free", plus: "Bartaboard Plus", monitor: "Monitor" };
const RESEND_AFTER_MS = 60_000;

/** An error Supabase put in the address after a sign-in link or Google, if any. */
function urlError(): string | null {
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  return params.get("error_description") ?? hash.get("error_description");
}

/** Takes the sign-in leftovers (?code=, #error=) out of the address. */
function cleanUrl() {
  if (location.search || location.hash) history.replaceState(null, "", location.pathname);
}

/** Sign in (Google, or an emailed code and link), and the signed-in account: plan, sign out, delete. */
export function AccountPanel() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = supabase().auth;
    const hadCode = new URLSearchParams(location.search).has("code");
    const fromUrl = urlError();
    // getSession waits for the client to finish any sign-in in the address (?code=).
    auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (fromUrl) setError(fromUrl);
      else if (hadCode && !data.session) {
        setError(
          "That sign-in link has to be opened in the browser where you asked for it. Enter the 6-digit code from the email instead.",
        );
      }
      cleanUrl();
    });
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="skeleton h-48 rounded-2xl" aria-busy aria-label="Loading your account" />;
  }
  return session ? (
    <SignedIn session={session} />
  ) : (
    <SignIn error={error} onError={setError} />
  );
}

function SignIn({ error, onError }: { error: string | null; onError: (message: string | null) => void }) {
  const [step, setStep] = useState<Step>({ name: "email" });
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    googleEnabled().then(setGoogle);
  }, []);

  async function withGoogle() {
    onError(null);
    setBusy(true);
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/account/` },
    });
    // On success the browser is already on its way to Google.
    if (error) {
      onError(error.message);
      setBusy(false);
    }
  }

  async function sendCode(email: string) {
    onError(null);
    setBusy(true);
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/account/` },
    });
    setBusy(false);
    if (error) onError(error.message);
    else setStep({ name: "code", email, sentAt: Date.now() });
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <h2 className="font-display text-xl font-semibold">Sign in or create an account</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        No password needed. Accounts are free; keyword alerts will live here.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {step.name === "email" ? (
        <>
          {google && (
            <>
              <button
                type="button"
                onClick={withGoogle}
                disabled={busy}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-background text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.98] disabled:opacity-60"
              >
                <GoogleMark className="h-5 w-5" />
                Continue with Google
              </button>
              <p className="my-4 flex items-center gap-3 text-xs text-muted" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </p>
            </>
          )}
          <EmailForm busy={busy} onSubmit={sendCode} spaced={!google} />
        </>
      ) : (
        <CodeForm
          step={step}
          busy={busy}
          setBusy={setBusy}
          onError={onError}
          onResend={() => sendCode(step.email)}
          onBack={() => {
            onError(null);
            setStep({ name: "email" });
          }}
        />
      )}

      <p className="mt-5 text-xs leading-relaxed text-muted">
        By continuing you agree to the{" "}
        <a href="/terms/" className="font-semibold text-accent hover:underline">
          terms
        </a>{" "}
        and{" "}
        <a href="/privacy/" className="font-semibold text-accent hover:underline">
          privacy policy
        </a>
        .
      </p>
    </section>
  );
}

function EmailForm({ busy, onSubmit, spaced }: { busy: boolean; onSubmit: (email: string) => void; spaced: boolean }) {
  const [email, setEmail] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(email.trim());
  }
  return (
    <form onSubmit={submit} className={spaced ? "mt-5" : ""}>
      <label htmlFor="account-email" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Email
      </label>
      <input
        id="account-email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-2 h-12 w-full rounded-xl border border-line bg-background px-4 text-base outline-none transition focus:border-accent"
      />
      <button
        type="submit"
        disabled={busy}
        className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background shadow-card transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Sending…" : "Email me a sign-in code"}
      </button>
    </form>
  );
}

function CodeForm({
  step,
  busy,
  setBusy,
  onError,
  onResend,
  onBack,
}: {
  step: Extract<Step, { name: "code" }>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const waitMs = step.sentAt + RESEND_AFTER_MS - now;

  useEffect(() => {
    input.current?.focus();
  }, [step.sentAt]);

  useEffect(() => {
    if (waitMs <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [waitMs]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setBusy(true);
    const { error } = await supabase().auth.verifyOtp({ email: step.email, token: code, type: "email" });
    setBusy(false);
    // On success, onAuthStateChange in AccountPanel shows the account.
    if (error) onError(error.message);
  }

  return (
    <form onSubmit={verify} className="mt-5">
      <p className="text-sm leading-relaxed">
        We sent a code to <strong className="font-semibold">{step.email}</strong>. Enter it here, or open the link in
        the email on this device.
      </p>
      <label htmlFor="account-code" className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Code
      </label>
      <input
        id="account-code"
        ref={input}
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]{6,10}"
        maxLength={10}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="123456"
        className="mt-2 h-12 w-full rounded-xl border border-line bg-background px-4 text-center font-mono text-xl tracking-[0.4em] outline-none transition focus:border-accent"
      />
      <button
        type="submit"
        disabled={busy || code.length < 6}
        className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background shadow-card transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Checking…" : "Sign in"}
      </button>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" onClick={onBack} className="font-semibold text-accent hover:underline">
          Use a different email
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={busy || waitMs > 0}
          className="font-semibold text-accent hover:underline disabled:text-muted disabled:no-underline"
        >
          {waitMs > 0 ? `Send again in ${Math.ceil(waitMs / 1000)} s` : "Send a new code"}
        </button>
      </div>
    </form>
  );
}

function SignedIn({ session }: { session: Session }) {
  const { user } = session;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (user.user_metadata.full_name ?? user.user_metadata.name) as string | undefined;
  const avatar = user.user_metadata.avatar_url as string | undefined;
  const via = user.app_metadata.provider === "google" ? "Google" : "email";

  useEffect(() => {
    supabase()
      .from("profiles")
      .select("plan, plan_until, created_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [user.id]);

  async function signOut() {
    setBusy(true);
    await supabase().auth.signOut({ scope: "local" });
  }

  async function deleteAccount() {
    setError(null);
    setBusy(true);
    const { error } = await supabase().rpc("delete_account");
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await supabase().auth.signOut({ scope: "local" });
  }

  const since = new Date(profile?.created_at ?? user.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar email={user.email ?? ""} src={avatar} className="h-14 w-14 text-xl" />
        <div className="min-w-0">
          {name && <p className="truncate font-display text-xl font-semibold">{name}</p>}
          <p className={`truncate ${name ? "text-sm text-muted" : "font-display text-xl font-semibold"}`}>{user.email}</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Plan</dt>
          <dd className="mt-1 font-semibold">{PLAN_LABEL[profile?.plan ?? "free"] ?? profile?.plan}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Signed in with</dt>
          <dd className="mt-1 font-semibold">{via}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Member since</dt>
          <dd className="mt-1 font-semibold">{since}</dd>
        </div>
      </dl>

      <p className="mt-6 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-muted">
        Keyword alerts and syncing your saved headlines across devices are coming next. Saved and pinned items stay on
        this device as before.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-card transition active:scale-95 disabled:opacity-60"
        >
          Sign out
        </button>
        {confirming ? (
          <span className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-danger">Delete your account and everything in it?</span>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={busy}
              className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-semibold text-white transition active:scale-95 disabled:opacity-60"
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="font-semibold text-accent hover:underline">
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto text-sm font-semibold text-danger hover:underline"
          >
            Delete my account
          </button>
        )}
      </div>
    </section>
  );
}

const GoogleMark = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={p.className}>
    <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6a5.1 5.1 0 0 1-2.2 3.3v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2Z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9Z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
  </svg>
);
