import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, issueToken, setAuthCookie } from "@/lib/auth";
import { handleError, jsonError } from "@/lib/api";

const Body = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const data = Body.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return jsonError("An account with that email already exists", 409);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: await hashPassword(data.password),
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    await setAuthCookie(await issueToken(user.id));
    return NextResponse.json({ user });
  } catch (err) {
    return handleError(err);
  }
}
