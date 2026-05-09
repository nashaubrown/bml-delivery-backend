"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Header({ userName }: { userName: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3 backdrop-blur">
      <Link href="/trips" className="text-lg font-semibold tracking-tight">
        TripPay
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-slate-500 sm:inline">{userName}</span>
        <button onClick={logout} className="text-slate-500 hover:text-slate-900">
          Log out
        </button>
      </div>
    </header>
  );
}
