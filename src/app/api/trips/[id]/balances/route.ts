import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";
import { requireMembership } from "@/lib/trip-access";
import { minimizeTransfers, type Balance } from "@/lib/splits";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);

    const trip = await prisma.trip.findUnique({
      where: { id: params.id },
      select: { baseCurrency: true },
    });
    if (!trip) return jsonError("Trip not found", 404);

    const [members, expenses, settlements] = await Promise.all([
      prisma.tripMember.findMany({
        where: { tripId: params.id },
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.expense.findMany({
        where: { tripId: params.id },
        include: { splits: true },
      }),
      prisma.settlement.findMany({ where: { tripId: params.id } }),
    ]);

    // net = paid - owed + received_settlements - sent_settlements
    const net = new Map<string, number>();
    for (const m of members) net.set(m.userId, 0);

    for (const e of expenses) {
      net.set(e.paidById, (net.get(e.paidById) ?? 0) + e.baseAmountCents);
      for (const s of e.splits) {
        net.set(s.userId, (net.get(s.userId) ?? 0) - s.baseAmountCents);
      }
    }
    for (const s of settlements) {
      // A settlement: from -> to. Debtor (from) increases their net (owed less),
      // creditor (to) decreases their net (received less owed to them).
      net.set(s.fromUserId, (net.get(s.fromUserId) ?? 0) + s.baseAmountCents);
      net.set(s.toUserId, (net.get(s.toUserId) ?? 0) - s.baseAmountCents);
    }

    const balances: Balance[] = Array.from(net.entries()).map(([userId, netCents]) => ({
      userId,
      netCents,
    }));
    const transfers = minimizeTransfers(balances);

    const usersById = Object.fromEntries(members.map((m) => [m.userId, m.user]));

    return NextResponse.json({
      currency: trip.baseCurrency,
      balances: balances.map((b) => ({
        userId: b.userId,
        name: usersById[b.userId]?.name ?? "Unknown",
        netCents: b.netCents,
      })),
      transfers: transfers.map((t) => ({
        fromUserId: t.fromUserId,
        fromName: usersById[t.fromUserId]?.name ?? "Unknown",
        toUserId: t.toUserId,
        toName: usersById[t.toUserId]?.name ?? "Unknown",
        amountCents: t.amountCents,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
