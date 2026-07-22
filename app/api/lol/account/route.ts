import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── LoL account CRUD ──────────────────────────────────────────────────────────
// Riot IDs are `gameName#tagLine` (e.g. "Rasmus#EUW"). Combined with a platform
// routing value (`region`), those three fields uniquely identify a summoner.
// Puuid is filled in on first Riot API lookup.

// GET  /api/lol/account                — list saved accounts, sorted
// POST /api/lol/account                — { gameName, tagLine, region? } → create
// PATCH /api/lol/account               — { id, sortOrder?, notes?, puuid? } → update
// DELETE /api/lol/account?id=X         — delete

export async function GET() {
  const accounts = await prisma.lolAccount.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { gameName, tagLine, region } = body;
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "gameName and tagLine required" }, { status: 400 });
  }
  const maxAcct = await prisma.lolAccount.findFirst({ orderBy: { sortOrder: "desc" } });
  const newSortOrder = (maxAcct?.sortOrder ?? -1) + 1;
  const account = await prisma.lolAccount.upsert({
    where: {
      gameName_tagLine_region: {
        gameName: String(gameName),
        tagLine: String(tagLine),
        region: String(region ?? "euw1").toLowerCase(),
      },
    },
    update: {},
    create: {
      gameName: String(gameName),
      tagLine: String(tagLine),
      region: String(region ?? "euw1").toLowerCase(),
      sortOrder: newSortOrder,
    },
  });
  return NextResponse.json({ account }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, sortOrder, notes, puuid } = body;
  if (id === undefined) return NextResponse.json({ error: "id required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder);
  if (notes    !== undefined) data.notes     = notes;
  if (puuid    !== undefined) data.puuid     = puuid;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const account = await prisma.lolAccount.update({ where: { id: parseInt(id) }, data });
  return NextResponse.json({ account });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.lolAccount.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
