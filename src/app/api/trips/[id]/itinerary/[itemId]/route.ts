import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";
import { requireMembership } from "@/lib/trip-access";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  location: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  attendeeIds: z.array(z.string()).optional(),
});

type Ctx = { params: { id: string; itemId: string } };

async function ensureBelongs(tripId: string, itemId: string) {
  const item = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!item || item.tripId !== tripId) {
    const err = new Error("Itinerary item not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return item;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    await ensureBelongs(params.id, params.itemId);
    const data = PatchBody.parse(await req.json());

    if (data.attendeeIds) {
      const valid = await prisma.tripMember.findMany({
        where: { tripId: params.id, userId: { in: data.attendeeIds } },
        select: { userId: true },
      });
      if (valid.length !== data.attendeeIds.length) {
        return jsonError("One or more attendees are not trip members", 400);
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.itineraryItem.update({
        where: { id: params.itemId },
        data: {
          title: data.title,
          location: data.location,
          notes: data.notes,
          startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
          endsAt:
            data.endsAt === undefined ? undefined : data.endsAt ? new Date(data.endsAt) : null,
        },
      });
      if (data.attendeeIds) {
        await tx.itineraryAttendee.deleteMany({ where: { itineraryItemId: params.itemId } });
        if (data.attendeeIds.length) {
          await tx.itineraryAttendee.createMany({
            data: data.attendeeIds.map((userId) => ({
              itineraryItemId: params.itemId,
              userId,
            })),
          });
        }
      }
      return updated;
    });

    return NextResponse.json({ item });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    await ensureBelongs(params.id, params.itemId);
    await prisma.itineraryItem.delete({ where: { id: params.itemId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
