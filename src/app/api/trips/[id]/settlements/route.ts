import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";
import { requireMembership } from "@/lib/trip-access";
import { toCents } from "@/lib/money";

const Body = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number().positive(),
  note: z.string().max(500).optional().nullable(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const settlements = await prisma.settlement.findMany({
      where: { tripId: params.id },
      orderBy: { settledAt: "desc" },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ settlements });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const data = Body.parse(await req.json());
    if (data.fromUserId === data.toUserId) {
      return jsonError("Cannot settle with yourself", 400);
    }
    const ids = [data.fromUserId, data.toUserId];
    const valid = await prisma.tripMember.findMany({
      where: { tripId: params.id, userId: { in: ids } },
      select: { userId: true },
    });
    if (valid.length !== 2) return jsonError("Both users must be trip members", 400);

    const settlement = await prisma.settlement.create({
      data: {
        tripId: params.id,
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
        baseAmountCents: toCents(data.amount),
        note: data.note ?? null,
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ settlement });
  } catch (err) {
    return handleError(err);
  }
}
