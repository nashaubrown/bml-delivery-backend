import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import TripDetail from "./trip-detail";

export default async function TripPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const trip = await prisma.trip.findFirst({
    where: { id: params.id, members: { some: { userId: user.id } } },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!trip) notFound();

  const me = trip.members.find((m) => m.userId === user.id)!;

  return (
    <main className="px-5 py-6">
      <Link href="/trips" className="text-sm text-slate-500 hover:underline">
        ← Trips
      </Link>
      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">{trip.name}</h1>
        <span className="text-xs text-slate-500">{trip.baseCurrency}</span>
      </div>
      {trip.destination && (
        <p className="text-slate-600">{trip.destination}</p>
      )}

      <TripDetail
        trip={{
          id: trip.id,
          name: trip.name,
          baseCurrency: trip.baseCurrency,
          inviteToken: trip.inviteToken,
        }}
        me={{ id: user.id, role: me.role }}
        members={trip.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
        }))}
      />
    </main>
  );
}
