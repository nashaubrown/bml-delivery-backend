import { NextResponse } from "next/server";
import { ZodError } from "zod";

type ApiError = Error & { status?: number };

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", issues: err.flatten() },
      { status: 400 }
    );
  }
  const e = err as ApiError;
  if (e?.status) return jsonError(e.message, e.status);
  console.error(err);
  return jsonError("Internal server error", 500);
}
