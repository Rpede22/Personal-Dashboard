export interface AssignmentLoad {
  id: number;
  title: string;
  dueDate: Date;
  estimatedHours: number;
}

export interface DaySlot {
  assignmentId: number;
  title: string;
  hours: number;
}

// Returns a map of "YYYY-MM-DD" → list of work blocks for that day
export function distributeLoad(
  assignments: AssignmentLoad[],
  dailyCapHours: number = 3
): Map<string, DaySlot[]> {
  const plan = new Map<string, DaySlot[]>();

  // Helper: format a Date as "YYYY-MM-DD"
  function dateKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // Helper: how many hours are already allocated on a given day
  function hoursUsed(key: string): number {
    return (plan.get(key) ?? []).reduce((sum, s) => sum + s.hours, 0);
  }

  // Sort by deadline, soonest first
  const sorted = [...assignments].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime()
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const assignment of sorted) {
    let remaining = assignment.estimatedHours;

    // Walk forward from today until deadline, filling available slots
    const cursor = new Date(today);
    while (remaining > 0 && cursor < assignment.dueDate) {
      const key = dateKey(cursor);
      const available = dailyCapHours - hoursUsed(key);

      if (available > 0) {
        const block = Math.min(remaining, available);
        if (!plan.has(key)) plan.set(key, []);
        plan.get(key)!.push({ assignmentId: assignment.id, title: assignment.title, hours: block });
        remaining -= block;
      }

      // Move to next day
      cursor.setDate(cursor.getDate() + 1);
    }
    // If remaining > 0 here, there weren't enough days — you can flag this
  }

  return plan;
}