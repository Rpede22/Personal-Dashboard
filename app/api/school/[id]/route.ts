import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // If marking done, allow clearing overdue
  const data: Record<string, unknown> = {};
  if (body.title !== undefined)   data.title   = body.title;
  if (body.dueDate !== undefined)  data.dueDate  = new Date(body.dueDate);
  if (body.dueTime !== undefined)  data.dueTime  = body.dueTime ?? null;
  if (body.subject !== undefined)  data.subject  = body.subject;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.status !== undefined)   data.status   = body.status;

  const assignment = await prisma.assignment.update({
    where: { id: parseInt(id) },
    data,
  });

  return NextResponse.json({ assignment });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.assignment.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
