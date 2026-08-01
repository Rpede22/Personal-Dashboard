import { Suspense } from "react";
import CalendarHub from "@/components/calendar/CalendarHub";

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarHub />
    </Suspense>
  );
}
