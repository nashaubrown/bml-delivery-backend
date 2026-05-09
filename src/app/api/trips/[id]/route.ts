import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { requireMembership, requireOrganizer } from "@/lib/trip-access";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  destination: z.string().max(120).nullable().optional(),
  baseCurrency: z.string().length(3).toUpperCase().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const trip = await prisma.trip.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ trip });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireOrganizer(params.id, user.id);
    const data = PatchBody.parse(await req.json());
    const trip = await prisma.trip.update({
      where: { id: params.id },
      data: {
        ...data,
        startDate:
          data.startDate === undefined ? undefined : data.startDate ? new Date(data.startDate) : null,
        endDate:
          data.endDate === undefined ? undefined : data.endDate ? new Date(data.endDate) : null,
      },
    });
    return NextResponse.json({ trip });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireOrganizer(params.id, user.id);
    await prisma.trip.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
