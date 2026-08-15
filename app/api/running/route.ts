import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");

  const runs = await prisma.runLog.findMany({
    orderBy: { date: "desc" },
    take: limit ? parseInt(limit) : undefined,
  });

  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { date, distance, duration, notes, shoeId } = body;

  if (!date || !distance || !duration) {
    return NextResponse.json(
      { error: "date, distance, and duration required" },
      { status: 400 }
    );
  }

  const runDate = new Date(date);
  // Snapshot any existing plan's distance so weekPlannedKm keeps the target
  // even after the plan is cleared. Manual logs don't delete plans right now,
  // but the snapshot means we can start doing so without losing history.
  const planForDay = await prisma.runPlan.findFirst({ where: { date: runDate } });

  const parsedShoeId = shoeId == null || shoeId === "" ? null : Number(shoeId);
  const run = await prisma.runLog.create({
    data: {
      date: runDate,
      distance: parseFloat(distance),
      duration: parseInt(duration),
      notes: notes ?? null,
      plannedDistance: planForDay?.distance ?? null,
      shoeId: Number.isInteger(parsedShoeId) ? parsedShoeId : null,
    },
  });

  return NextResponse.json({ run }, { status: 201 });
}
