import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.runLog.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}

/**
 * Partial update. Right now only used for re-assigning a shoe on an existing
 * run (`{ shoeId: 3 }` or `{ shoeId: null }` to clear).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("shoeId" in body) {
    if (body.shoeId == null || body.shoeId === "") data.shoeId = null;
    else {
      const n = Number(body.shoeId);
      if (!Number.isInteger(n)) return NextResponse.json({ error: "invalid shoeId" }, { status: 400 });
      data.shoeId = n;
    }
  }
  const run = await prisma.runLog.update({ where: { id: parseInt(id) }, data });
  return NextResponse.json({ run });
}
