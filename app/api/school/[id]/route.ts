import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const assignment = await prisma.assignment.update({
    where: { id: parseInt(id) },
    data: {
      title: body.title,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      subject: body.subject,
      priority: body.priority,
      status: body.status,
    },
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
