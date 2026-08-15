import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Running shoe CRUD + per-shoe km totals.
 *
 * GET  → { shoes: [{ id, name, purchaseDate, retired, notes, sortOrder,
 *                     totalKm, runs }] }  (km + count derived from RunLog)
 * POST { name, purchaseDate?, notes? }
 * PATCH { id, name?, purchaseDate?, retired?, notes?, sortOrder? }
 * DELETE ?id=X  (also nulls out shoeId on any run using it — no cascade)
 */

export async function GET() {
  const shoes = await prisma.shoe.findMany({
    orderBy: [{ retired: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });

  // Total km + run count per shoe. Uses a groupBy so we don't hydrate all runs.
  const totals = await prisma.runLog.groupBy({
    by: ["shoeId"],
    _sum: { distance: true },
    _count: { _all: true },
    where: { shoeId: { not: null } },
  });
  const byId = new Map<number, { totalKm: number; runs: number }>();
  for (const row of totals) {
    if (row.shoeId == null) continue;
    byId.set(row.shoeId, {
      totalKm: Math.round(((row._sum.distance ?? 0)) * 100) / 100,
      runs: row._count._all,
    });
  }

  return NextResponse.json({
    shoes: shoes.map((s) => ({
      ...s,
      totalKm: byId.get(s.id)?.totalKm ?? 0,
      runs: byId.get(s.id)?.runs ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null;
  if (purchaseDate && !isFinite(purchaseDate.getTime())) return NextResponse.json({ error: "invalid purchaseDate" }, { status: 400 });
  const shoe = await prisma.shoe.create({
    data: { name, purchaseDate, notes: String(body.notes ?? "") },
  });
  return NextResponse.json(shoe);
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = String(body.name ?? "").trim();
  if ("purchaseDate" in body) {
    if (body.purchaseDate == null || body.purchaseDate === "") data.purchaseDate = null;
    else {
      const d = new Date(body.purchaseDate);
      if (!isFinite(d.getTime())) return NextResponse.json({ error: "invalid purchaseDate" }, { status: 400 });
      data.purchaseDate = d;
    }
  }
  if ("retired" in body) data.retired = Boolean(body.retired);
  if ("notes" in body) data.notes = String(body.notes ?? "");
  if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder) || 0;
  const shoe = await prisma.shoe.update({ where: { id }, data });
  return NextResponse.json(shoe);
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  // Null out the shoeId on any runs using this shoe so we don't leave dangling FKs.
  await prisma.runLog.updateMany({ where: { shoeId: id }, data: { shoeId: null } });
  await prisma.shoe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
