import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const statusParam = searchParams.get("status"); // comma-separated

  const statuses = statusParam ? statusParam.split(",") : undefined;

  const assignments = await prisma.assignment.findMany({
    where: {
      status: statuses ? { in: statuses } : undefined,
    },
    orderBy: { dueDate: "asc" },
    take: limitParam ? parseInt(limitParam) : undefined,
  });

  return NextResponse.json({ assignments });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { title, dueDate, subject, priority } = body;

  if (!title || !dueDate) {
    return NextResponse.json({ error: "title and dueDate required" }, { status: 400 });
  }

  const assignment = await prisma.assignment.create({
    data: {
      title,
      dueDate: new Date(dueDate),
      subject: subject ?? null,
      priority: priority ?? "medium",
      status: "pending",
    },
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
