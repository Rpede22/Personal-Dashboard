"use client";

import { useState } from "react";
import { useTabOrder } from "@/lib/tab-order";

/**
 * Reusable tab strip with HTML5 drag-and-drop reorder. Order is persisted
 * per-hub via `useTabOrder(hubKey, defaults)`. Small ⋮⋮ handle appears at
 * the top-right of every tab when hovered so you can grab it without
 * accidentally clicking through. Tab labels come from a plain map.
 *
 * Styling matches the existing NHLHub / SportsHub tab strips — accent
 * color highlights the active tab; hovered drop-target gets a dashed
 * outline. Non-reorderable variants (fixed order) can still call this by
 * ignoring the drag handle: just wire `onSelect` and the reorder feature
 * lives in the background.
 */
export default function ReorderableTabs<T extends string>({
  hubKey,
  defaults,
  active,
  labels,
  onSelect,
  accent,
  variant = "underline",
}: {
  hubKey: string;
  defaults: readonly T[];
  active: T;
  labels: Record<T, string>;
  onSelect: (tab: T) => void;
  accent: string;
  /**
   * Two supported looks:
   *   - "underline" (default, NHLHub): transparent bg, accent-colored text
   *     when active, subtle bordered pill when active.
   *   - "pill" (SportsHub): filled accent bg + white text when active,
   *     surface bg with muted text otherwise.
   */
  variant?: "underline" | "pill";
}) {
  const { order, moveBefore } = useTabOrder(hubKey, defaults);
  const [dragging, setDragging] = useState<T | null>(null);
  const [hover, setHover] = useState<T | null>(null);

  return (
    <div className="flex gap-1 flex-wrap">
      {order.map((t) => {
        const isActive = t === active;
        const isHover = hover === t && dragging !== null && dragging !== t;
        const isDragging = dragging === t;
        return (
          <div
            key={t}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (hover !== t) setHover(t);
            }}
            onDragLeave={() => { if (hover === t) setHover(null); }}
            onDrop={(e) => {
              e.preventDefault();
              const from = (e.dataTransfer.getData("text/plain") || dragging) as T | "";
              if (from && from !== t) moveBefore(from as T, t);
              setDragging(null);
              setHover(null);
            }}
            className="relative"
            style={{
              opacity: isDragging ? 0.4 : 1,
              outline: isHover ? `2px dashed ${accent}` : undefined,
              borderRadius: "8px",
            }}
          >
            <button
              onClick={() => onSelect(t)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", t);
                setDragging(t);
              }}
              onDragEnd={() => { setDragging(null); setHover(null); }}
              className={
                variant === "pill"
                  ? "px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-grab active:cursor-grabbing"
                  : "px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-grab active:cursor-grabbing"
              }
              style={variant === "pill" ? {
                background: isActive ? accent : "var(--surface)",
                color: isActive ? "#fff" : "var(--text-muted)",
                border: `1px solid ${isActive ? accent : "var(--border)"}`,
              } : {
                background: isActive ? "var(--surface)" : "transparent",
                color: isActive ? accent : "var(--text-muted)",
                border: isActive ? "1px solid var(--border)" : "1px solid transparent",
              }}
              title="Drag to reorder"
            >
              {labels[t]}
            </button>
          </div>
        );
      })}
    </div>
  );
}
