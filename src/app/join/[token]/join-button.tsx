"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/trips/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to join");
      return;
    }
    const { tripId } = await res.json();
    router.push(`/trips/${tripId}`);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <button onClick={join} disabled={busy} className="btn-primary w-full">
        {busy ? "Joining…" : "Join trip"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
