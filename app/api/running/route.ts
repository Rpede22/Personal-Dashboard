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
  const { date, distance, duration, notes } = body;

  if (!date || !distance || !duration) {
    return NextResponse.json(
      { error: "date, distance, and duration required" },
      { status: 400 }
    );
  }

  const run = await prisma.runLog.create({
    data: {
      date: new Date(date),
      distance: parseFloat(distance),
      duration: parseInt(duration),
      notes: notes ?? null,
    },
  });

  return NextResponse.json({ run }, { status: 201 });
}
