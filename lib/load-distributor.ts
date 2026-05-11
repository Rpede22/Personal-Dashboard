export interface AssignmentLoad {
  id: number;
  title: string;
  dueDate: Date;
  estimatedHours: number;
  hoursSpent?: number; // hours already logged — subtracted from remaining work
}

export interface DaySlot {
  assignmentId: number;
  title: string;
  hours: number;
}

export interface LoadResult {
  plan: Map<string, DaySlot[]>;
  // Maps assignmentId → last scheduled work date ("YYYY-MM-DD")
  estDoneByAssignment: Map<number, string>;
  // true if this assignment ever needed more than SOFT_CAP hours on a single day
  needsHardCap: Map<number, boolean>;
}

const SOFT_CAP = 3;  // preferred hours per day (green)
const HARD_CAP = 10; // absolute max hours per day (red above this)

function dateKey(d: Date): string {
  // Use local date parts — toISOString() is UTC and shifts the date in UTC+1/+2
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Sequential scheduler: finishes one assignment completely before starting the next.
// Assignments sorted by deadline (soonest first).
// Daily target = SOFT_CAP (3h) so each assignment finishes as fast as possible,
// freeing the most days for later ones. When a tight deadline forces more than
// SOFT_CAP, escalates smoothly up to HARD_CAP (10h). All block sizes rounded up
// to the nearest 0.5h. If a day still has capacity after an assignment finishes,
// the next assignment begins on that same day.
export function distributeLoad(assignments: AssignmentLoad[]): LoadResult {
  const plan = new Map<string, DaySlot[]>();
  const estDoneByAssignment = new Map<number, string>();
  const needsHardCap = new Map<number, boolean>();

  function hoursUsed(key: string): number {
    return (plan.get(key) ?? []).reduce((s, sl) => s + sl.hours, 0);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sort by deadline, soonest first
  const sorted = [...assignments].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime()
  );

  // Precompute remaining hours per assignment for look-ahead
  const remainingHours = sorted.map((a) =>
    Math.max(0, a.estimatedHours - (a.hoursSpent ?? 0))
  );

  // nextStart advances as each assignment finishes
  let nextStart = new Date(today);

  for (let idx = 0; idx < sorted.length; idx++) {
    const assignment = sorted[idx];
    const remaining = remainingHours[idx];
    if (remaining <= 0) continue;

    // If previous assignments have pushed us past this deadline, flag it but skip
    if (nextStart >= assignment.dueDate) {
      estDoneByAssignment.set(assignment.id, dateKey(assignment.dueDate));
      needsHardCap.set(assignment.id, true);
      continue;
    }

    // Look-ahead: how many days do future assignments need at SOFT_CAP?
    const futureWork = remainingHours
      .slice(idx + 1)
      .reduce((s, h) => s + h, 0);
    const futureDaysNeeded = Math.ceil(futureWork / SOFT_CAP);

    // Days available from nextStart to this assignment's deadline
    const msToCurrent = assignment.dueDate.getTime() - nextStart.getTime();
    const daysToCurrent = Math.max(1, Math.ceil(msToCurrent / (1000 * 60 * 60 * 24)));

    // Reserve future days: compress current assignment into fewer days so later
    // ones have breathing room at SOFT_CAP
    const daysForCurrent = Math.max(1, daysToCurrent - futureDaysNeeded);

    // Rate needed to finish current assignment within its compressed window
    const lookaheadRate = remaining / daysForCurrent;

    let rem = remaining;
    const cursor = new Date(nextStart);
    let lastKey = "";

    while (rem > 0.05 && cursor < assignment.dueDate) {
      const key = dateKey(cursor);
      const alreadyUsed = hoursUsed(key);
      const msLeft = assignment.dueDate.getTime() - cursor.getTime();
      const daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      // Minimum hours needed today to finish exactly on deadline
      const idealToday = rem / daysLeft;

      // Use the higher of: SOFT_CAP, deadline-driven rate, and look-ahead rate.
      // Look-ahead rate compresses earlier assignments so later ones get enough days.
      const dailyTarget = Math.min(Math.max(SOFT_CAP, idealToday, lookaheadRate), HARD_CAP);

      // Space left on this day (accounts for hours already used by a prior assignment)
      const available = Math.max(0, dailyTarget - alreadyUsed);
      const block = Math.min(rem, available);
      // Round up to nearest 0.5h
      const rounded = Math.ceil(block * 2) / 2;

      if (rounded >= 0.5) {
        if (!plan.has(key)) plan.set(key, []);
        plan.get(key)!.push({
          assignmentId: assignment.id,
          title: assignment.title,
          hours: rounded,
        });
        rem = Math.max(0, rem - rounded);
        lastKey = key;
        estDoneByAssignment.set(assignment.id, key);
      }

      if (idealToday > SOFT_CAP || lookaheadRate > SOFT_CAP) {
        needsHardCap.set(assignment.id, true);
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    if (rem > 0.05 && !estDoneByAssignment.has(assignment.id)) {
      estDoneByAssignment.set(assignment.id, dateKey(assignment.dueDate));
    }

    // If the last scheduled day still has capacity, the next assignment can
    // start there. Otherwise it starts the following day.
    if (lastKey && hoursUsed(lastKey) < SOFT_CAP) {
      const [y, mo, d] = lastKey.split("-").map(Number);
      nextStart = new Date(y, mo - 1, d);
      nextStart.setHours(0, 0, 0, 0);
    } else {
      nextStart = new Date(cursor);
    }
  }

  return { plan, estDoneByAssignment, needsHardCap };
}
