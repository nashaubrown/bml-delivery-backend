import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { requireOrganizer } from "@/lib/trip-access";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireOrganizer(params.id, user.id);
    const trip = await prisma.trip.update({
      where: { id: params.id },
      data: { inviteToken: randomBytes(16).toString("hex") },
      select: { id: true, inviteToken: true },
    });
    return NextResponse.json({ trip });
  } catch (err) {
    return handleError(err);
  }
}
