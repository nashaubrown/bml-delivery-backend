import { PrismaClient, SplitType, TripRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

// Inline copies so the seed doesn't depend on src/ imports (simpler tsx run).
function toCents(n: number) {
  return Math.round(n * 100);
}

type SplitEntry = { userId: string; baseAmountCents: number; shares?: number; percent?: number };

function reconcile(arr: SplitEntry[], total: number): SplitEntry[] {
  const sum = arr.reduce((s, x) => s + x.baseAmountCents, 0);
  let diff = total - sum;
  const step = diff > 0 ? 1 : -1;
  let i = 0;
  while (diff !== 0 && arr.length > 0) {
    arr[i % arr.length].baseAmountCents += step;
    diff -= step;
    i++;
  }
  return arr;
}

function equalSplit(total: number, userIds: string[]): SplitEntry[] {
  const each = Math.floor(total / userIds.length);
  return reconcile(
    userIds.map((userId) => ({ userId, baseAmountCents: each })),
    total
  );
}

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding…");

  await prisma.settlement.deleteMany();
  await prisma.expenseSplit.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.itineraryAttendee.deleteMany();
  await prisma.itineraryItem.deleteMany();
  await prisma.tripMember.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password", 10);
  const [alice, bob, carol] = await Promise.all([
    prisma.user.create({
      data: { email: "alice@example.com", name: "Alice", passwordHash },
    }),
    prisma.user.create({
      data: { email: "bob@example.com", name: "Bob", passwordHash },
    }),
    prisma.user.create({
      data: { email: "carol@example.com", name: "Carol", passwordHash },
    }),
  ]);

  const trip = await prisma.trip.create({
    data: {
      name: "Bali 2026",
      destination: "Bali, Indonesia",
      description: "A week of beaches, temples, and questionable scooters.",
      baseCurrency: "USD",
      startDate: new Date("2026-06-10T00:00:00Z"),
      endDate: new Date("2026-06-17T00:00:00Z"),
      inviteToken: randomBytes(16).toString("hex"),
      createdById: alice.id,
      members: {
        create: [
          { userId: alice.id, role: TripRole.ORGANIZER },
          { userId: bob.id, role: TripRole.MEMBER },
          { userId: carol.id, role: TripRole.MEMBER },
        ],
      },
    },
  });

  // Itinerary
  const day1 = await prisma.itineraryItem.create({
    data: {
      tripId: trip.id,
      title: "Arrival + dinner at Locavore",
      location: "Ubud",
      notes: "Reservation at 8pm. Smart casual.",
      startsAt: new Date("2026-06-10T13:00:00Z"),
      endsAt: new Date("2026-06-10T22:00:00Z"),
      createdById: alice.id,
      attendees: {
        create: [
          { userId: alice.id },
          { userId: bob.id },
          { userId: carol.id },
        ],
      },
    },
  });

  await prisma.itineraryItem.create({
    data: {
      tripId: trip.id,
      title: "Sunrise hike — Mt Batur",
      location: "Kintamani",
      notes: "4am pickup. Bring water and a light jacket.",
      startsAt: new Date("2026-06-12T20:00:00Z"),
      endsAt: new Date("2026-06-13T03:00:00Z"),
      createdById: bob.id,
      attendees: {
        create: [{ userId: alice.id }, { userId: bob.id }],
      },
    },
  });

  await prisma.itineraryItem.create({
    data: {
      tripId: trip.id,
      title: "Surf lesson",
      location: "Canggu — Old Man's",
      startsAt: new Date("2026-06-14T09:00:00Z"),
      endsAt: new Date("2026-06-14T11:00:00Z"),
      createdById: carol.id,
      attendees: {
        create: [{ userId: bob.id }, { userId: carol.id }],
      },
    },
  });

  // Expenses
  // 1) Villa booked by Alice in USD, equal split 3 ways: $900
  {
    const total = toCents(900);
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        paidById: alice.id,
        description: "Villa, 7 nights",
        amountCents: total,
        currency: "USD",
        fxRate: 1,
        baseAmountCents: total,
        date: new Date("2026-06-10T00:00:00Z"),
        splitType: SplitType.EQUAL,
        splits: {
          create: equalSplit(total, [alice.id, bob.id, carol.id]),
        },
      },
    });
  }

  // 2) Dinner at Locavore in IDR, paid by Bob, equal split 3 ways
  // 3,000,000 IDR @ 0.0000625 -> ~$187.50 base
  {
    const fxRate = 0.0000625;
    const amountCents = toCents(3_000_000);
    const baseAmountCents = Math.round(amountCents * fxRate);
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        paidById: bob.id,
        description: "Dinner at Locavore",
        amountCents,
        currency: "IDR",
        fxRate,
        baseAmountCents,
        date: new Date("2026-06-10T22:00:00Z"),
        splitType: SplitType.EQUAL,
        itineraryItemId: day1.id,
        splits: {
          create: equalSplit(baseAmountCents, [alice.id, bob.id, carol.id]),
        },
      },
    });
  }

  // 3) Scooter rentals, paid by Carol — only Bob & Carol used scooters
  // $80 USD, 60/40 by shares (Carol rode more): Carol 3, Bob 2
  {
    const total = toCents(80);
    const shares = [
      { userId: bob.id, shares: 2 },
      { userId: carol.id, shares: 3 },
    ];
    const totalShares = shares.reduce((s, x) => s + x.shares, 0);
    const splits: SplitEntry[] = shares.map((s) => ({
      userId: s.userId,
      baseAmountCents: Math.floor((total * s.shares) / totalShares),
      shares: s.shares,
    }));
    reconcile(splits, total);
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        paidById: carol.id,
        description: "Scooter rentals (5 days)",
        amountCents: total,
        currency: "USD",
        fxRate: 1,
        baseAmountCents: total,
        date: new Date("2026-06-12T08:00:00Z"),
        splitType: SplitType.SHARES,
        splits: { create: splits },
      },
    });
  }

  // 4) Surf lesson, paid by Bob, percent split (Carol 60%, Bob 40%) — $50
  {
    const total = toCents(50);
    const entries = [
      { userId: bob.id, percent: 40 },
      { userId: carol.id, percent: 60 },
    ];
    const splits: SplitEntry[] = entries.map((e) => ({
      userId: e.userId,
      baseAmountCents: Math.floor((total * e.percent) / 100),
      percent: e.percent,
    }));
    reconcile(splits, total);
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        paidById: bob.id,
        description: "Surf lesson",
        amountCents: total,
        currency: "USD",
        fxRate: 1,
        baseAmountCents: total,
        date: new Date("2026-06-14T11:00:00Z"),
        splitType: SplitType.PERCENT,
        splits: { create: splits },
      },
    });
  }

  // 5) Groceries, paid by Alice, unequal: Alice $20, Bob $15, Carol $15 = $50
  {
    const splits: SplitEntry[] = [
      { userId: alice.id, baseAmountCents: toCents(20) },
      { userId: bob.id, baseAmountCents: toCents(15) },
      { userId: carol.id, baseAmountCents: toCents(15) },
    ];
    const total = splits.reduce((s, x) => s + x.baseAmountCents, 0);
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        paidById: alice.id,
        description: "Groceries",
        amountCents: total,
        currency: "USD",
        fxRate: 1,
        baseAmountCents: total,
        date: new Date("2026-06-13T15:00:00Z"),
        splitType: SplitType.UNEQUAL,
        splits: { create: splits },
      },
    });
  }

  console.log("Seeded ✓");
  console.log("Login as: alice@example.com / bob@example.com / carol@example.com");
  console.log("Password: password");
  console.log(`Invite link: /join/${trip.inviteToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
