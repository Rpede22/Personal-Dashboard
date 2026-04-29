import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALL_SLOTS = [
  "HEAD", "NECK", "SHOULDERS", "BACK", "CHEST", "WRISTS",
  "HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2",
  "TRINKET_1", "TRINKET_2", "MAIN_HAND", "OFF_HAND",
];

// GET /api/wow/gear-wishlist?characterId=X
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = parseInt(searchParams.get("characterId") ?? "0");
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 });

  const saved = await prisma.wowGearWishlist.findMany({ where: { characterId } });

  // Return all 16 slots, filling in empty placeholders for unsaved ones
  const items = ALL_SLOTS.map((slot) => {
    const found = saved.find((i) => i.slot === slot);
    return found ?? { id: null, characterId, slot, itemName: "", obtained: false };
  });

  return NextResponse.json({ items });
}

// POST /api/wow/gear-wishlist — upsert a slot entry
export async function POST(request: Request) {
  const { characterId, slot, itemName, obtained } = await request.json();
  if (!characterId || !slot) {
    return NextResponse.json({ error: "characterId and slot required" }, { status: 400 });
  }

  const item = await prisma.wowGearWishlist.upsert({
    where: { characterId_slot: { characterId, slot } },
    update: {
      ...(itemName !== undefined ? { itemName } : {}),
      ...(obtained !== undefined ? { obtained } : {}),
    },
    create: {
      characterId,
      slot,
      itemName: itemName ?? "",
      obtained: obtained ?? false,
    },
  });

  return NextResponse.json({ item });
}

// DELETE /api/wow/gear-wishlist?characterId=X  — clear all slots for a character
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = parseInt(searchParams.get("characterId") ?? "0");
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 });

  await prisma.wowGearWishlist.deleteMany({ where: { characterId } });
  return NextResponse.json({ ok: true });
}
