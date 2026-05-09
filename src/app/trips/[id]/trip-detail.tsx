"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";

type Member = { id: string; name: string; email: string; role: "ORGANIZER" | "MEMBER" };
type Trip = { id: string; name: string; baseCurrency: string; inviteToken: string };

type ItineraryItem = {
  id: string;
  title: string;
  location: string | null;
  notes: string | null;
  startsAt: string;
  endsAt: string | null;
  createdBy: { id: string; name: string };
  attendees: { user: { id: string; name: string } }[];
};

type Expense = {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  fxRate: number;
  baseAmountCents: number;
  date: string;
  splitType: "EQUAL" | "UNEQUAL" | "SHARES" | "PERCENT";
  paidBy: { id: string; name: string };
  itineraryItem: { id: string; title: string } | null;
  splits: { user: { id: string; name: string }; baseAmountCents: number }[];
};

type Balances = {
  currency: string;
  balances: { userId: string; name: string; netCents: number }[];
  transfers: {
    fromUserId: string;
    fromName: string;
    toUserId: string;
    toName: string;
    amountCents: number;
  }[];
};

type Tab = "itinerary" | "expenses" | "balances" | "members";

export default function TripDetail({
  trip,
  me,
  members,
}: {
  trip: Trip;
  me: { id: string; role: "ORGANIZER" | "MEMBER" };
  members: Member[];
}) {
  const [tab, setTab] = useState<Tab>("itinerary");
  return (
    <>
      <nav className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
        {(["itinerary", "expenses", "balances", "members"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("tab", tab === t && "tab-active")}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <section className="mt-4">
        {tab === "itinerary" && <ItineraryTab trip={trip} members={members} />}
        {tab === "expenses" && (
          <ExpensesTab trip={trip} members={members} me={me} />
        )}
        {tab === "balances" && <BalancesTab trip={trip} members={members} />}
        {tab === "members" && <MembersTab trip={trip} me={me} members={members} />}
      </section>
    </>
  );
}

// ─── Itinerary ──────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ItineraryTab({ trip, members }: { trip: Trip; members: Member[] }) {
  const [items, setItems] = useState<ItineraryItem[] | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const res = await fetch(`/api/trips/${trip.id}/itinerary`);
    const data = await res.json();
    setItems(data.items);
  }

  useEffect(() => {
    load();
  }, [trip.id]);

  async function remove(id: string) {
    if (!confirm("Delete this item?")) return;
    await fetch(`/api/trips/${trip.id}/itinerary/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Itinerary
        </h2>
        <button onClick={() => setAdding((v) => !v)} className="btn-secondary text-xs">
          {adding ? "Cancel" : "+ Add item"}
        </button>
      </div>

      {adding && (
        <ItineraryForm
          trip={trip}
          members={members}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {items === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="card text-sm text-slate-500">No itinerary items yet.</p>
      ) : (
        items.map((it) => (
          <article key={it.id} className="card">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">{it.title}</h3>
              <button
                onClick={() => remove(it.id)}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                Delete
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {fmtDateTime(it.startsAt)}
              {it.endsAt && ` → ${fmtDateTime(it.endsAt)}`}
            </p>
            {it.location && (
              <p className="text-sm text-slate-500">📍 {it.location}</p>
            )}
            {it.notes && <p className="mt-2 text-sm">{it.notes}</p>}
            {it.attendees.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                With: {it.attendees.map((a) => a.user.name).join(", ")}
              </p>
            )}
          </article>
        ))
      )}
    </div>
  );
}

function ItineraryForm({
  trip,
  members,
  onDone,
}: {
  trip: Trip;
  members: Member[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>(members.map((m) => m.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/trips/${trip.id}/itinerary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        location: location || null,
        notes: notes || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        attendeeIds,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed");
      return;
    }
    onDone();
  }

  function toggle(id: string) {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label className="label">Location</label>
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Starts</label>
          <input
            className="input"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Ends</label>
          <input
            className="input"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea
          className="input min-h-20"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Attendees</label>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => toggle(m.id)}
              className={clsx(
                "rounded-full px-3 py-1 text-xs ring-1",
                attendeeIds.includes(m.id)
                  ? "bg-brand-600 text-white ring-brand-600"
                  : "bg-white text-slate-600 ring-slate-200"
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Add item"}
      </button>
    </form>
  );
}

// ─── Expenses ───────────────────────────────────────────────────────────────

function ExpensesTab({
  trip,
  members,
  me,
}: {
  trip: Trip;
  members: Member[];
  me: { id: string; role: "ORGANIZER" | "MEMBER" };
}) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const res = await fetch(`/api/trips/${trip.id}/expenses`);
    const data = await res.json();
    setExpenses(data.expenses);
  }
  useEffect(() => {
    load();
  }, [trip.id]);

  async function remove(id: string) {
    if (!confirm("Delete this expense?")) return;
    const res = await fetch(`/api/trips/${trip.id}/expenses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Failed to delete");
      return;
    }
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Expenses
        </h2>
        <button onClick={() => setAdding((v) => !v)} className="btn-secondary text-xs">
          {adding ? "Cancel" : "+ Add expense"}
        </button>
      </div>

      {adding && (
        <ExpenseForm
          trip={trip}
          members={members}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {expenses === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : expenses.length === 0 ? (
        <p className="card text-sm text-slate-500">No expenses yet.</p>
      ) : (
        expenses.map((e) => (
          <article key={e.id} className="card">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">{e.description}</h3>
              <span className="text-sm font-semibold">
                {formatMoney(e.amountCents, e.currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Paid by {e.paidBy.name} · {new Date(e.date).toLocaleDateString()} ·{" "}
              {e.splitType.toLowerCase()} split
              {e.currency !== trip.baseCurrency &&
                ` · ${formatMoney(e.baseAmountCents, trip.baseCurrency)} @ ${e.fxRate}`}
            </p>
            {e.itineraryItem && (
              <p className="mt-1 text-xs text-slate-500">
                For: {e.itineraryItem.title}
              </p>
            )}
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-slate-500">
                Split ({e.splits.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {e.splits.map((s) => (
                  <li key={s.user.id} className="flex justify-between">
                    <span>{s.user.name}</span>
                    <span className="text-slate-600">
                      {formatMoney(s.baseAmountCents, trip.baseCurrency)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            {(e.paidBy.id === me.id || me.role === "ORGANIZER") && (
              <button
                onClick={() => remove(e.id)}
                className="mt-2 text-xs text-slate-400 hover:text-red-600"
              >
                Delete
              </button>
            )}
          </article>
        ))
      )}
    </div>
  );
}

type SplitMode = "EQUAL" | "UNEQUAL" | "SHARES" | "PERCENT";

function ExpenseForm({
  trip,
  members,
  onDone,
}: {
  trip: Trip;
  members: Member[];
  onDone: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(trip.baseCurrency);
  const [fxRate, setFxRate] = useState("1");
  const [paidById, setPaidById] = useState(members[0]?.id ?? "");
  const [mode, setMode] = useState<SplitMode>("EQUAL");
  const [participants, setParticipants] = useState<string[]>(members.map((m) => m.id));
  const [unequal, setUnequal] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.id, "1"]))
  );
  const [percent, setPercent] = useState<Record<string, string>>(
    Object.fromEntries(
      members.map((m) => [m.id, (100 / Math.max(members.length, 1)).toFixed(2)])
    )
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalEntered = useMemo(() => {
    if (mode === "UNEQUAL") {
      return Object.values(unequal).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    if (mode === "PERCENT") {
      return Object.values(percent).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    return null;
  }, [mode, unequal, percent]);

  function toggleParticipant(id: string) {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount");
      setBusy(false);
      return;
    }

    let split: unknown;
    if (mode === "EQUAL") {
      if (participants.length === 0) {
        setError("Pick at least one participant");
        setBusy(false);
        return;
      }
      split = { type: "EQUAL", participants };
    } else if (mode === "UNEQUAL") {
      const entries = members
        .filter((m) => participants.includes(m.id))
        .map((m) => ({
          userId: m.id,
          amount: Number(unequal[m.id] ?? 0),
        }));
      split = { type: "UNEQUAL", entries };
    } else if (mode === "SHARES") {
      const entries = members
        .filter((m) => participants.includes(m.id))
        .map((m) => ({
          userId: m.id,
          shares: Number(shares[m.id] ?? 0),
        }));
      split = { type: "SHARES", entries };
    } else {
      const entries = members
        .filter((m) => participants.includes(m.id))
        .map((m) => ({
          userId: m.id,
          percent: Number(percent[m.id] ?? 0),
        }));
      split = { type: "PERCENT", entries };
    }

    const res = await fetch(`/api/trips/${trip.id}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        amount: amt,
        currency,
        fxRate: Number(fxRate) || 1,
        paidById,
        split,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div>
        <label className="label">Description</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dinner at Locavore"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount</label>
          <input
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="120.50"
            required
          />
        </div>
        <div>
          <label className="label">Currency</label>
          <input
            className="input uppercase"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        </div>
      </div>
      {currency !== trip.baseCurrency && (
        <div>
          <label className="label">
            FX rate ({currency} → {trip.baseCurrency})
          </label>
          <input
            className="input"
            inputMode="decimal"
            value={fxRate}
            onChange={(e) => setFxRate(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            e.g. for 1 EUR = 1.08 USD enter 1.08.
          </p>
        </div>
      )}
      <div>
        <label className="label">Paid by</label>
        <select
          className="input"
          value={paidById}
          onChange={(e) => setPaidById(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Split type</label>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
          {(["EQUAL", "UNEQUAL", "SHARES", "PERCENT"] as SplitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={clsx("flex-1 rounded-md py-1.5", mode === m && "bg-white shadow")}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Participants</label>
        <div className="space-y-2">
          {members.map((m) => {
            const on = participants.includes(m.id);
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-lg ring-1 ring-slate-100 px-3 py-2"
              >
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleParticipant(m.id)}
                  />
                  <span>{m.name}</span>
                </label>
                {on && mode === "UNEQUAL" && (
                  <input
                    className="input w-24 text-right"
                    inputMode="decimal"
                    value={unequal[m.id] ?? ""}
                    onChange={(e) =>
                      setUnequal((p) => ({ ...p, [m.id]: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                )}
                {on && mode === "SHARES" && (
                  <input
                    className="input w-20 text-right"
                    inputMode="numeric"
                    value={shares[m.id] ?? ""}
                    onChange={(e) =>
                      setShares((p) => ({ ...p, [m.id]: e.target.value }))
                    }
                  />
                )}
                {on && mode === "PERCENT" && (
                  <input
                    className="input w-20 text-right"
                    inputMode="decimal"
                    value={percent[m.id] ?? ""}
                    onChange={(e) =>
                      setPercent((p) => ({ ...p, [m.id]: e.target.value }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        {mode === "UNEQUAL" && totalEntered !== null && (
          <p className="mt-1 text-xs text-slate-500">
            Sum: {totalEntered.toFixed(2)} {currency} (must equal {amount || "0"})
          </p>
        )}
        {mode === "PERCENT" && totalEntered !== null && (
          <p className="mt-1 text-xs text-slate-500">
            Sum: {totalEntered.toFixed(2)}% (must equal 100)
          </p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Add expense"}
      </button>
    </form>
  );
}

// ─── Balances ───────────────────────────────────────────────────────────────

function BalancesTab({ trip, members }: { trip: Trip; members: Member[] }) {
  const [data, setData] = useState<Balances | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/trips/${trip.id}/balances`);
    setData(await res.json());
  }
  useEffect(() => {
    load();
  }, [trip.id]);

  async function settle(t: Balances["transfers"][number]) {
    const key = `${t.fromUserId}->${t.toUserId}-${t.amountCents}`;
    setBusyKey(key);
    await fetch(`/api/trips/${trip.id}/settlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        amount: t.amountCents / 100,
      }),
    });
    setBusyKey(null);
    load();
  }

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Net per person ({data.currency})
        </h2>
        <ul className="mt-2 space-y-1">
          {data.balances.map((b) => (
            <li
              key={b.userId}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100"
            >
              <span>{b.name}</span>
              <span
                className={clsx(
                  "font-medium",
                  b.netCents > 0
                    ? "text-emerald-600"
                    : b.netCents < 0
                    ? "text-red-600"
                    : "text-slate-500"
                )}
              >
                {b.netCents > 0 ? "+" : ""}
                {formatMoney(b.netCents, data.currency)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-slate-500">
          Positive = is owed. Negative = owes.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Settle up
        </h2>
        {data.transfers.length === 0 ? (
          <p className="card text-sm text-slate-500">All settled. 🎉</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.transfers.map((t) => {
              const key = `${t.fromUserId}->${t.toUserId}-${t.amountCents}`;
              return (
                <li key={key} className="card flex items-center justify-between">
                  <span className="text-sm">
                    <strong>{t.fromName}</strong> → <strong>{t.toName}</strong>
                    <span className="ml-2 text-slate-500">
                      {formatMoney(t.amountCents, data.currency)}
                    </span>
                  </span>
                  <button
                    onClick={() => settle(t)}
                    disabled={busyKey === key}
                    className="btn-primary text-xs"
                  >
                    {busyKey === key ? "…" : "Mark paid"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-500">
        Members: {members.length}. Settling records a payment that adjusts net
        balances.
      </p>
    </div>
  );
}

// ─── Members ────────────────────────────────────────────────────────────────

function MembersTab({
  trip,
  me,
  members,
}: {
  trip: Trip;
  me: { id: string; role: "ORGANIZER" | "MEMBER" };
  members: Member[];
}) {
  const [token, setToken] = useState(trip.inviteToken);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const inviteUrl = useMemo(() => {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${origin}/join/${token}`;
  }, [token]);

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function regenerate() {
    if (!confirm("Replace the invite link? The old one will stop working.")) return;
    setBusy(true);
    const res = await fetch(`/api/trips/${trip.id}/invite`, { method: "POST" });
    setBusy(false);
    if (!res.ok) return;
    const data = await res.json();
    setToken(data.trip.inviteToken);
  }

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Invite link
        </h2>
        <div className="card mt-2 space-y-2">
          <input className="input" value={inviteUrl} readOnly onFocus={(e) => e.target.select()} />
          <div className="flex gap-2">
            <button onClick={copy} className="btn-primary flex-1 text-sm">
              {copied ? "Copied!" : "Copy link"}
            </button>
            {me.role === "ORGANIZER" && (
              <button
                onClick={regenerate}
                disabled={busy}
                className="btn-secondary text-sm"
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Members ({members.length})
        </h2>
        <ul className="mt-2 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs",
                  m.role === "ORGANIZER"
                    ? "bg-brand-50 text-brand-700"
                    : "bg-slate-100 text-slate-600"
                )}
              >
                {m.role.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
