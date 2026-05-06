import { Suspense } from "react";
import StudentEntryContent from "./StudentEntryContent";

// /v/[slug] is the student-facing entry surface. The legacy /lecture/[slug]
// remains the professor/owner viewer; the student route is intentionally
// separate per docs/planning/06-student-pages.md and the W4 task brief.
export default function StudentEntryPage() {
  return (
    <Suspense fallback={null}>
      <StudentEntryContent />
    </Suspense>
  );
}
