import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns a Date for when an assignment becomes overdue, respecting dueTime if set.
function overdueThreshold(dueDate: Date, dueTime: string | null): Date {
  if (!dueTime) {
    // No time set — overdue at start of day after dueDate (midnight)
    const t = new Date(dueDate);
    t.setHours(23, 59, 59, 999);
    return t;
  }
  // dueTime is stored as "HH:MM" in local time. Parse it.
  const [hh, mm] = dueTime.split(":").map(Number);
  const t = new Date(dueDate);
  t.setHours(hh, mm, 0, 0);
  return t;
}

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

  // Auto-mark overdue: any pending/in_progress assignment whose due threshold has passed
  const now = new Date();
  const updates: Promise<unknown>[] = [];
  for (const a of assignments) {
    if (a.status !== "done" && a.status !== "overdue") {
      const threshold = overdueThreshold(a.dueDate, a.dueTime ?? null);
      if (now > threshold) {
        updates.push(
          prisma.assignment.update({
            where: { id: a.id },
            data: { status: "overdue" },
          })
        );
        a.status = "overdue"; // update in-memory too
      }
    }
  }
  await Promise.all(updates);

  return NextResponse.json({ assignments });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { title, dueDate, dueTime, subject, priority } = body;

  if (!title || !dueDate) {
    return NextResponse.json({ error: "title and dueDate required" }, { status: 400 });
  }

  const assignment = await prisma.assignment.create({
    data: {
      title,
      dueDate: new Date(dueDate),
      dueTime: dueTime ?? null,
      subject: subject ?? null,
      priority: priority ?? "medium",
      status: "pending",
    },
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
