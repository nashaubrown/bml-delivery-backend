import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

function fmtRange(start: Date | null, end: Date | null) {
  if (!start && !end) return null;
  const f = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (start && end) return `${f(start)} – ${f(end)}`;
  return f((start ?? end)!);
}

export default async function TripsPage() {
  const user = await requireUser();
  const trips = await prisma.trip.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { members: true, expenses: true, itinerary: true } },
    },
  });

  return (
    <main className="px-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your trips</h1>
        <Link href="/trips/new" className="btn-primary">
          New trip
        </Link>
      </div>
      {trips.length === 0 ? (
        <div className="card mt-6 text-center text-slate-500">
          <p>No trips yet.</p>
          <p className="mt-1 text-sm">Create one or join via an invite link.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trips/${t.id}`} className="card block hover:bg-slate-50">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold">{t.name}</h2>
                  <span className="text-xs text-slate-500">{t.baseCurrency}</span>
                </div>
                {t.destination && (
                  <p className="text-sm text-slate-600">{t.destination}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {fmtRange(t.startDate, t.endDate) ?? "Dates not set"} ·{" "}
                  {t._count.members} member{t._count.members === 1 ? "" : "s"} ·{" "}
                  {t._count.expenses} expense{t._count.expenses === 1 ? "" : "s"} ·{" "}
                  {t._count.itinerary} itinerary item{t._count.itinerary === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
