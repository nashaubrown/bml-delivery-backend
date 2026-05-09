import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";
import { TripRole } from "@prisma/client";

const Body = z.object({ token: z.string().min(8) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { token } = Body.parse(await req.json());
    const trip = await prisma.trip.findUnique({ where: { inviteToken: token } });
    if (!trip) return jsonError("Invalid invite link", 404);
    await prisma.tripMember.upsert({
      where: { tripId_userId: { tripId: trip.id, userId: user.id } },
      update: {},
      create: { tripId: trip.id, userId: user.id, role: TripRole.MEMBER },
    });
    return NextResponse.json({ tripId: trip.id });
  } catch (err) {
    return handleError(err);
  }
}
