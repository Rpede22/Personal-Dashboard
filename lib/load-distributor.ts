export interface AssignmentLoad {
  id: number;
  title: string;
  dueDate: Date;
  dueTime?: string; // HH:MM local — caps available hours on due day (work starts 09:00)
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
  // true if this assignment ever needed more than softCap hours on a single day
  needsHardCap: Map<number, boolean>;
}

const DEFAULT_softCap = 3; // default preferred hours per day
const HARD_CAP = 10;        // absolute max hours per day
const WORK_START_HOUR = 9; // work begins at 09:00

function dateKey(d: Date): string {
  // Use local date parts — toISOString() is UTC and shifts the date in UTC+1/+2
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Advance d (in-place) to the next day that is in workDays.
// If workDays is empty (all days disabled) this is a no-op to avoid infinite loops.
function advanceToWorkDay(d: Date, workDays: number[]): void {
  if (workDays.length === 0) return;
  while (!workDays.includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
}

// Sequential scheduler: finishes one assignment completely before starting the next.
// Assignments sorted by deadline (soonest first).
// workDays: JS day numbers (0=Sun … 6=Sat) that are available for school work.
//   Defaults to all 7 days. Non-work days are skipped entirely.
// Due-time cap: when dueTime is set on an assignment, the due-day itself can only
//   receive (dueHour - WORK_START_HOUR) hours (e.g. due 12:00 → 3 h, due 15:00 → 6 h).
export function distributeLoad(
  assignments: AssignmentLoad[],
  workDays: number[] = [0, 1, 2, 3, 4, 5, 6],
  softCap: number = DEFAULT_softCap
): LoadResult {
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

  // Ratio used to approximate calendar days from work days in look-ahead
  const calDaysPerWorkDay = workDays.length > 0 ? 7 / workDays.length : 1;

  // nextStart advances as each assignment finishes; always lands on a work day
  let nextStart = new Date(today);
  advanceToWorkDay(nextStart, workDays);

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

    // Look-ahead: only compress this assignment if future work can't fit comfortably
    // after it finishes at softCap.
    const futureWork = remainingHours.slice(idx + 1).reduce((s, h) => s + h, 0);

    // Calendar-day estimate for this assignment at natural pace (adjusted for work days)
    const daysAtSoftCap = Math.ceil(remaining / softCap) * calDaysPerWorkDay;
    const naturalFinishMs = nextStart.getTime() + daysAtSoftCap * 86400000;

    // Calendar days remaining for future work after natural finish → last deadline
    const lastDeadline = sorted[sorted.length - 1].dueDate;
    const msAfterFinish = Math.max(0, lastDeadline.getTime() - naturalFinishMs);
    const daysAfterFinish = Math.floor(msAfterFinish / 86400000);
    // Approximate work days available for future work
    const workDaysAfterFinish = Math.floor(daysAfterFinish / calDaysPerWorkDay);

    // Future work that can't fit at softCap in the remaining work days
    const overflowWork = Math.max(0, futureWork - workDaysAfterFinish * softCap);

    // Only raise the rate above softCap when there's genuine overflow
    let lookaheadRate = softCap;
    if (overflowWork > 0) {
      const extraWorkDaysNeeded = Math.ceil(overflowWork / softCap);
      const workDaysForCurrent = Math.max(1, Math.ceil(remaining / softCap) - extraWorkDaysNeeded);
      lookaheadRate = remaining / workDaysForCurrent;
    }

    let rem = remaining;
    const cursor = new Date(nextStart);
    let lastKey = "";

    while (rem > 0.05 && cursor < assignment.dueDate) {
      const key = dateKey(cursor);
      const alreadyUsed = hoursUsed(key);
      const msLeft = assignment.dueDate.getTime() - cursor.getTime();
      // Count remaining work days (including today) up to deadline
      const calDaysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
      const workDaysLeft = Math.max(1, Math.round(calDaysLeft / calDaysPerWorkDay));

      // Minimum hours needed today to finish exactly on deadline
      const idealToday = rem / workDaysLeft;

      // Use the higher of: softCap, deadline-driven rate, and look-ahead rate.
      const dailyTarget = Math.min(Math.max(softCap, idealToday, lookaheadRate), HARD_CAP);

      // Due-time cap: on the actual due date, work is limited to (dueHour - WORK_START_HOUR)
      let dayCapacity = HARD_CAP;
      if (dateKey(cursor) === dateKey(assignment.dueDate) && assignment.dueTime) {
        const [hh] = assignment.dueTime.split(":").map(Number);
        dayCapacity = Math.max(0, hh - WORK_START_HOUR);
      }

      const available = Math.max(0, Math.min(dailyTarget, dayCapacity) - alreadyUsed);
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

      if (idealToday > softCap || lookaheadRate > softCap) {
        needsHardCap.set(assignment.id, true);
      }

      cursor.setDate(cursor.getDate() + 1);
      // Skip non-work days
      advanceToWorkDay(cursor, workDays);
    }

    if (rem > 0.05 && !estDoneByAssignment.has(assignment.id)) {
      estDoneByAssignment.set(assignment.id, dateKey(assignment.dueDate));
    }

    // If the last scheduled day still has capacity, the next assignment can
    // start there. Otherwise advance to the next work day after cursor.
    if (lastKey && hoursUsed(lastKey) < softCap) {
      const [y, mo, d] = lastKey.split("-").map(Number);
      nextStart = new Date(y, mo - 1, d);
      nextStart.setHours(0, 0, 0, 0);
    } else {
      nextStart = new Date(cursor);
      advanceToWorkDay(nextStart, workDays);
    }
  }

  return { plan, estDoneByAssignment, needsHardCap };
}
