import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { TripRole } from "@prisma/client";

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  destination: z.string().max(120).optional().nullable(),
  baseCurrency: z.string().length(3).toUpperCase().default("USD"),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const trips = await prisma.trip.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true, expenses: true, itinerary: true } },
        members: {
          take: 6,
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
    return NextResponse.json({ trips });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const data = CreateBody.parse(await req.json());
    const trip = await prisma.trip.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        destination: data.destination ?? null,
        baseCurrency: data.baseCurrency,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        inviteToken: randomBytes(16).toString("hex"),
        createdById: user.id,
        members: {
          create: { userId: user.id, role: TripRole.ORGANIZER },
        },
      },
    });
    return NextResponse.json({ trip });
  } catch (err) {
    return handleError(err);
  }
}
