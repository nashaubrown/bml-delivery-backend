import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";
import { requireMembership } from "@/lib/trip-access";

type Ctx = { params: { id: string; expenseId: string } };

export async function DELETE(_: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    await requireMembership(params.id, user.id);
    const expense = await prisma.expense.findUnique({ where: { id: params.expenseId } });
    if (!expense || expense.tripId !== params.id) {
      return jsonError("Expense not found", 404);
    }
    // Only the creator (payer) or the trip organizer can delete.
    if (expense.paidById !== user.id) {
      const member = await prisma.tripMember.findUnique({
        where: { tripId_userId: { tripId: params.id, userId: user.id } },
      });
      if (member?.role !== "ORGANIZER") {
        return jsonError("Only the payer or an organizer can delete this expense", 403);
      }
    }
    await prisma.expense.delete({ where: { id: params.expenseId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
