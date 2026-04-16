import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/running/plans/[id] — update completed or other fields
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { completed, distance, type, notes } = body;

  const data: Record<string, unknown> = {};
  if (completed !== undefined) data.completed = completed;
  if (distance !== undefined) data.distance = distance !== null ? parseFloat(distance) : null;
  if (type !== undefined) data.type = type;
  if (notes !== undefined) data.notes = notes;

  const plan = await prisma.runPlan.update({
    where: { id: parseInt(id) },
    data,
  });

  return NextResponse.json({ plan });
}

// DELETE /api/running/plans/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.runPlan.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
