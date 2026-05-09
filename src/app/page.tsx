import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/trips");

  return (
    <main className="px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight">TripPay</h1>
      <p className="mt-2 text-slate-600">
        Plan trips with friends. Build a shared itinerary. Split expenses in any
        currency. Settle up with the fewest transfers possible.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="btn-primary">
          Log in
        </Link>
        <Link href="/register" className="btn-secondary">
          Create account
        </Link>
      </div>
      <ul className="mt-12 space-y-3 text-sm text-slate-600">
        <li>• Invite friends with a shareable link</li>
        <li>• Daily itinerary with attendees and notes</li>
        <li>• Equal, unequal, share, and percent splits</li>
        <li>• Multi-currency with stored FX rates</li>
        <li>• Settle-up with greedy transfer minimization</li>
      </ul>
    </main>
  );
}
