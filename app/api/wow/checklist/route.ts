import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function currentWeekStart(): Date {
  const now = new Date();
  // WoW weekly reset is Wednesday 06:00 UTC
  const day = now.getUTCDay(); // 0=Sun, 3=Wed
  const daysSinceWed = (day - 3 + 7) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysSinceWed);
  weekStart.setUTCHours(6, 0, 0, 0);
  return weekStart;
}

// GET /api/wow/checklist?characterId=X OR ?summary=true
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const summary = searchParams.get("summary") === "true";
  const characterId = searchParams.get("characterId");
  const weekStart = currentWeekStart();

  if (summary) {
    const characters = await prisma.wowCharacter.findMany();
    const summaries = await Promise.all(
      characters.map(async (char) => {
        const tasks = await prisma.wowChecklist.findMany({
          where: { characterId: char.id, weekStart },
        });
        return {
          character: char.name,
          characterId: char.id,
          total: tasks.length,
          done: tasks.filter((t) => t.done).length,
        };
      })
    );
    return NextResponse.json({ summaries, weekStart });
  }

  if (!characterId) {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  const charId = parseInt(characterId);

  // Get or create this week's checklist
  // Always sync with current templates — adds any missing tasks without touching already-ticked ones.
  // This handles: first load, new templates added mid-week, boss count changes.
  const templates = await prisma.wowChecklistTemplate.findMany();
  if (templates.length > 0) {
    for (const t of templates) {
      await prisma.wowChecklist.upsert({
        where: {
          characterId_weekStart_task: {
            characterId: charId,
            weekStart,
            task: t.task,
          },
        },
        update: {},
        create: {
          characterId: charId,
          weekStart,
          task: t.task,
          done: false,
        },
      });
    }
  }

  const checklist = await prisma.wowChecklist.findMany({
    where: { characterId: charId, weekStart },
  });
  return NextResponse.json({ checklist, weekStart });
}

// POST /api/wow/checklist — add a task or toggle done
export async function POST(request: Request) {
  const body = await request.json();
  const { characterId, task, done, id } = body;
  const weekStart = currentWeekStart();

  // Toggle existing task
  if (id !== undefined) {
    const updated = await prisma.wowChecklist.update({
      where: { id },
      data: { done: done ?? false },
    });
    return NextResponse.json({ item: updated });
  }

  // Add new task
  if (!characterId || !task) {
    return NextResponse.json({ error: "characterId and task required" }, { status: 400 });
  }

  const item = await prisma.wowChecklist.upsert({
    where: {
      characterId_weekStart_task: {
        characterId: parseInt(characterId),
        weekStart,
        task,
      },
    },
    update: { done: false },
    create: {
      characterId: parseInt(characterId),
      weekStart,
      task,
      done: false,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}

// DELETE /api/wow/checklist?id=X — remove a task from this week
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.wowChecklist.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
