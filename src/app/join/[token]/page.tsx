import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import JoinButton from "./join-button";

export default async function JoinPage({ params }: { params: { token: string } }) {
  const trip = await prisma.trip.findUnique({
    where: { inviteToken: params.token },
    select: { id: true, name: true, destination: true, baseCurrency: true },
  });
  if (!trip) {
    return (
      <main className="px-5 py-12">
        <h1 className="text-xl font-bold">Invite not found</h1>
        <p className="mt-2 text-slate-600">
          This invite link is invalid or has been revoked.
        </p>
        <Link href="/" className="btn-secondary mt-6 inline-flex">
          Home
        </Link>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/join/${params.token}`);
  }

  return (
    <main className="px-5 py-12">
      <h1 className="text-2xl font-bold">Join &ldquo;{trip.name}&rdquo;</h1>
      {trip.destination && (
        <p className="mt-1 text-slate-600">{trip.destination}</p>
      )}
      <p className="mt-4 text-sm text-slate-500">
        You&apos;ll join as a member. Balances are tracked in {trip.baseCurrency}.
      </p>
      <JoinButton token={params.token} />
    </main>
  );
}
