import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/running/plans?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const plans = await prisma.runPlan.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ plans });
}

// POST /api/running/plans — create a plan
export async function POST(request: Request) {
  const body = await request.json();
  const { date, distance, type, notes } = body;

  if (!date || !type) {
    return NextResponse.json(
      { error: "date and type required" },
      { status: 400 }
    );
  }

  const plan = await prisma.runPlan.create({
    data: {
      date: new Date(date),
      distance: distance ? parseFloat(distance) : null,
      type,
      notes: notes ?? null,
      completed: false,
    },
  });

  return NextResponse.json({ plan }, { status: 201 });
}
