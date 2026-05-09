import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";
import { requireMembership } from "@/lib/trip-access";
import { resolveSplit, type SplitInput } from "@/lib/splits";
import { toCents } from "@/lib/money";

const SplitBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EQUAL"), participants: z.array(z.string()).min(1) }),
  z.object({
    type: z.literal("UNEQUAL"),
    entries: z
      .array(z.object({ userId: z.string(), amount: z.number().nonnegative() }))
      .min(1),
  }),
  z.object({
    type: z.literal("SHARES"),
    entries: z
      .array(z.object({ userId: z.string(), shares: z.number().positive() }))
      .min(1),
  }),
  z.object({
    type: z.literal("PERCENT"),
    entries: z
      .array(z.object({ userId: z.string(), percent: z.number().min(0).max(100) }))
      .min(1),
  }),
]);

const CreateBody = z.object({
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().length(3).toUpperCase(),
  fxRate: z.number().positive().default(1),
  date: z.string().datetime().optional(),
  paidById: z.string(),
  itineraryItemId: z.string().nullable().optional(),
  split: SplitBody,
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const expenses = await prisma.expense.findMany({
      where: { tripId: params.id },
      orderBy: { date: "desc" },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
        itineraryItem: { select: { id: true, title: true } },
      },
    });
    return NextResponse.json({ expenses });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const data = CreateBody.parse(await req.json());

    const trip = await prisma.trip.findUnique({
      where: { id: params.id },
      select: { baseCurrency: true },
    });
    if (!trip) return jsonError("Trip not found", 404);

    // Validate participating users are trip members.
    const participantIds = (() => {
      switch (data.split.type) {
        case "EQUAL":
          return data.split.participants;
        default:
          return data.split.entries.map((e) => e.userId);
      }
    })();
    const userIds = Array.from(new Set([data.paidById, ...participantIds]));
    const validMembers = await prisma.tripMember.findMany({
      where: { tripId: params.id, userId: { in: userIds } },
      select: { userId: true },
    });
    if (validMembers.length !== userIds.length) {
      return jsonError("Payer or participants are not all trip members", 400);
    }

    const fxRate =
      data.currency === trip.baseCurrency ? 1 : data.fxRate;
    const amountCents = toCents(data.amount);
    const baseAmountCents = Math.round(amountCents * fxRate);

    // Convert split entries into the lib's expected shape (cents in base currency).
    let splitInput: SplitInput;
    if (data.split.type === "EQUAL") {
      splitInput = { type: "EQUAL", participants: data.split.participants };
    } else if (data.split.type === "UNEQUAL") {
      splitInput = {
        type: "UNEQUAL",
        entries: data.split.entries.map((e) => ({
          userId: e.userId,
          // UNEQUAL inputs are entered in expense currency; convert to base cents.
          amountCents: Math.round(toCents(e.amount) * fxRate),
        })),
      };
      // Recompute total for UNEQUAL using sum (avoids rounding mismatch on FX).
      const sum = splitInput.entries.reduce((s, e) => s + e.amountCents, 0);
      if (sum !== baseAmountCents) {
        // Adjust last entry to match total exactly.
        const diff = baseAmountCents - sum;
        splitInput.entries[splitInput.entries.length - 1].amountCents += diff;
      }
    } else if (data.split.type === "SHARES") {
      splitInput = {
        type: "SHARES",
        entries: data.split.entries.map((e) => ({
          userId: e.userId,
          shares: e.shares,
        })),
      };
    } else {
      splitInput = {
        type: "PERCENT",
        entries: data.split.entries.map((e) => ({
          userId: e.userId,
          percent: e.percent,
        })),
      };
    }

    const resolved = resolveSplit(baseAmountCents, splitInput);

    const expense = await prisma.expense.create({
      data: {
        tripId: params.id,
        paidById: data.paidById,
        description: data.description,
        amountCents,
        currency: data.currency,
        fxRate,
        baseAmountCents,
        date: data.date ? new Date(data.date) : new Date(),
        splitType: data.split.type,
        itineraryItemId: data.itineraryItemId ?? null,
        splits: { create: resolved },
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
        itineraryItem: { select: { id: true, title: true } },
      },
    });
    return NextResponse.json({ expense });
  } catch (err) {
    return handleError(err);
  }
}
