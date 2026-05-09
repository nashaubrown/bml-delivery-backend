import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";
import { requireMembership } from "@/lib/trip-access";

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  location: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  attendeeIds: z.array(z.string()).optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const items = await prisma.itineraryItem.findMany({
      where: { tripId: params.id },
      orderBy: { startsAt: "asc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        attendees: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json({ items });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const data = CreateBody.parse(await req.json());

    if (data.attendeeIds && data.attendeeIds.length > 0) {
      const valid = await prisma.tripMember.findMany({
        where: { tripId: params.id, userId: { in: data.attendeeIds } },
        select: { userId: true },
      });
      if (valid.length !== data.attendeeIds.length) {
        return jsonError("One or more attendees are not trip members", 400);
      }
    }

    const item = await prisma.itineraryItem.create({
      data: {
        tripId: params.id,
        title: data.title,
        location: data.location ?? null,
        notes: data.notes ?? null,
        startsAt: new Date(data.startsAt),
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        createdById: user.id,
        attendees: {
          create: (data.attendeeIds ?? []).map((userId) => ({ userId })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        attendees: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json({ item });
  } catch (err) {
    return handleError(err);
  }
}
