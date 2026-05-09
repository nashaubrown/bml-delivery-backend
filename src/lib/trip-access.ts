import { prisma } from "./prisma";
import { TripRole } from "@prisma/client";

export async function requireMembership(tripId: string, userId: string) {
  const member = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
  if (!member) {
    const err = new Error("Not a member of this trip");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return member;
}

export async function requireOrganizer(tripId: string, userId: string) {
  const member = await requireMembership(tripId, userId);
  if (member.role !== TripRole.ORGANIZER) {
    const err = new Error("Organizer access required");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return member;
}
