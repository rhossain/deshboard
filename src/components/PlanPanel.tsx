"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { BKASH_NUMBER, PLUS_FEATURES, activePlan, formatDate, taka } from "@/lib/plans";

interface Price {
  plan: string;
  months: number;
  taka: number;
}

interface Payment {
  id: number;
  months: number;
  taka: number;
  trx_id: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
}

interface PendingPayment {
  id: number;
  email: string;
  months: number;
  taka: number;
  sender: string;
  trx_id: string;
  created_at: string;
}

const label = "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted";
const field =
  "mt-2 h-12 w-full rounded-xl border border-line bg-background px-4 text-base outline-none transition focus:border-accent";
const primary =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background shadow-card transition active:scale-[0.98] disabled:opacity-60";

const length = (months: number) => (months === 12 ? "1 year" : months === 1 ? "1 month" : `${months} months`);

/** Translates the database's refusals into what the reader can do about them. */
function paymentError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "That transaction ID has already been submitted.";
  if (error.code === "23514") return "Check the bKash number (11 digits, starting 01) and the transaction ID.";
  return error.message;
}

async function fetchPayments(): Promise<Payment[]> {
  const { data } = await supabase()
    .from("payments")
    .select("id, months, taka, trx_id, status, note, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  return (data as Payment[] | null) ?? [];
}

async function fetchPending(): Promise<{ list: PendingPayment[]; error: string | null }> {
  const { data, error } = await supabase().rpc("pending_payments");
  return { list: (data as PendingPayment[] | null) ?? [], error: error?.message ?? null };
}

/** Plus: the plan in force, paying for more with bKash, and the payments sent so far. */
export function PlanPanel({ profile }: { profile: { plan: string; plan_until: string | null } | null }) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    supabase()
      .from("plan_prices")
      .select("plan, months, taka")
      .eq("plan", "plus")
      .order("months")
      .then(({ data }) => setPrices((data as Price[] | null) ?? []));
    fetchPayments().then(setPayments);
  }, []);

  const plan = activePlan(profile);
  const pending = payments?.some((p) => p.status === "pending");

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <h2 className="font-display text-xl font-semibold">Bartaboard Plus</h2>
      {plan === "plus" && profile?.plan_until ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          You have Plus until <strong className="font-semibold text-foreground">{formatDate(profile.plan_until)}</strong>.
          Paying again adds to that date.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm leading-relaxed">
          {PLUS_FEATURES.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden className="text-accent">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
      )}

      {paying ? (
        <PayForm
          prices={prices}
          onCancel={() => setPaying(false)}
          onSent={() => {
            setPaying(false);
            fetchPayments().then(setPayments);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPaying(true)}
          disabled={prices.length === 0}
          className={`mt-5 ${primary}`}
        >
          {plan === "plus" ? "Extend with bKash" : `Get Plus with bKash${prices[0] ? ` from ${taka(prices[0].taka)}` : ""}`}
        </button>
      )}

      {pending && (
        <p className="mt-4 rounded-xl bg-accent-soft p-3 text-sm leading-relaxed">
          We check bKash payments by hand, usually within a day. Your plan starts as soon as yours is checked.
        </p>
      )}

      {payments && payments.length > 0 && (
        <div className="mt-6">
          <h3 className={label}>Your payments</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span>
                  {taka(p.taka)} · {length(p.months)} · <span className="font-mono">{p.trx_id}</span>
                  <span className="block text-xs text-muted">{formatDate(p.created_at)}</span>
                </span>
                <span
                  className={`text-xs font-semibold ${
                    p.status === "approved" ? "text-accent" : p.status === "rejected" ? "text-danger" : "text-muted"
                  }`}
                >
                  {p.status === "approved" ? "Approved" : p.status === "rejected" ? "Not found" : "Being checked"}
                  {p.note && <span className="block font-normal">{p.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PayForm({ prices, onCancel, onSent }: { prices: Price[]; onCancel: () => void; onSent: () => void }) {
  const [months, setMonths] = useState(prices.find((p) => p.months === 12)?.months ?? prices[0]?.months ?? 1);
  const [sender, setSender] = useState("");
  const [trxId, setTrxId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const price = prices.find((p) => p.months === months);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase()
      .from("payments")
      .insert({ plan: "plus", months, sender, trx_id: trxId.toUpperCase() });
    setBusy(false);
    if (error) setError(paymentError(error));
    else onSent();
  }

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(BKASH_NUMBER);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (!BKASH_NUMBER) {
    return (
      <p className="mt-5 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-muted">
        Paying with bKash isn&apos;t open yet. (Set the BKASH_NUMBER repository variable.)
        <button type="button" onClick={onCancel} className="ml-2 font-semibold text-accent hover:underline">
          Close
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5">
      <fieldset>
        <legend className={label}>1. Choose how long</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {prices.map((p) => (
            <label
              key={p.months}
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm transition ${
                p.months === months ? "border-accent bg-accent-soft" : "border-line bg-background hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="months"
                value={p.months}
                checked={p.months === months}
                onChange={() => setMonths(p.months)}
                className="sr-only"
              />
              <span className="block font-semibold">{length(p.months)}</span>
              <span className="block text-muted">{taka(p.taka)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <p className={label}>2. Pay with bKash</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          <li>
            In the bKash app, tap <strong className="font-semibold">Payment</strong> (not Send Money).
          </li>
          <li>
            Pay <strong className="font-semibold">{price ? taka(price.taka) : "…"}</strong> to{" "}
            <strong className="font-mono font-semibold">{BKASH_NUMBER}</strong>{" "}
            <button type="button" onClick={copyNumber} className="font-semibold text-accent hover:underline">
              {copied ? "Copied" : "Copy"}
            </button>
          </li>
          <li>Keep the transaction ID (TrxID) from the confirmation.</li>
        </ol>
      </div>

      <p className={`mt-5 ${label}`}>3. Tell us about it</p>
      <label htmlFor="pay-sender" className="mt-2 block text-sm">
        The bKash number you paid from
      </label>
      <input
        id="pay-sender"
        required
        inputMode="numeric"
        autoComplete="tel-national"
        pattern="01[3-9][0-9]{8}"
        maxLength={11}
        value={sender}
        onChange={(e) => setSender(e.target.value.replace(/\D/g, ""))}
        placeholder="01XXXXXXXXX"
        className={field}
      />
      <label htmlFor="pay-trx" className="mt-3 block text-sm">
        Transaction ID
      </label>
      <input
        id="pay-trx"
        required
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        pattern="[A-Za-z0-9]{8,12}"
        maxLength={12}
        value={trxId}
        onChange={(e) => setTrxId(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
        placeholder="e.g. 9A1B2C3D4E"
        className={`${field} font-mono uppercase tracking-wider`}
      />

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy || !price} className={`mt-4 ${primary}`}>
        {busy ? "Sending…" : "Submit payment"}
      </button>
      <button type="button" onClick={onCancel} className="mt-3 w-full text-sm font-semibold text-accent hover:underline">
        Cancel
      </button>
    </form>
  );
}

/** For admins: bKash payments waiting to be checked against the bKash app. */
export function AdminPayments() {
  const [list, setList] = useState<PendingPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchPending().then((result) => {
      setList(result.list);
      if (result.error) setError(result.error);
    });
  }, []);

  useEffect(load, [load]);

  async function review(id: number, approve: boolean) {
    const reason = approve ? null : "We couldn't find this payment in bKash. Check the transaction ID and try again.";
    setError(null);
    setBusyId(id);
    const { error } = await supabase().rpc("review_payment", { payment_id: id, approve, reason });
    setBusyId(null);
    if (error) setError(error.message);
    load();
  }

  return (
    <section className="mt-6 rounded-2xl border border-gold/40 bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Payments to check</h2>
        <button type="button" onClick={load} className="text-sm font-semibold text-accent hover:underline">
          Refresh
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Find each transaction ID in the bKash app and check the amount before approving.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {list === null ? (
        <div className="skeleton mt-4 h-16 rounded-xl" aria-busy />
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm">Nothing waiting.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {list.map((p) => (
            <li key={p.id} className="py-3">
              <p>
                <strong className="font-semibold">{taka(p.taka)}</strong> · {length(p.months)} ·{" "}
                <span className="font-mono">{p.trx_id}</span>
              </p>
              <p className="text-xs text-muted">
                {p.email} · from {p.sender} · {new Date(p.created_at).toLocaleString("en-GB")}
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => review(p.id, true)}
                  disabled={busyId !== null}
                  className="inline-flex h-9 items-center rounded-full bg-accent px-4 font-semibold text-accent-ink transition active:scale-95 disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => review(p.id, false)}
                  disabled={busyId !== null}
                  className="inline-flex h-9 items-center rounded-full border border-line px-4 font-semibold text-danger transition active:scale-95 disabled:opacity-60"
                >
                  Not found
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
