import { Suspense } from "react";
import SignupContent from "./SignupContent";

// Student-only sign-up page. Professors continue to use /auth/login (no
// dedicated sign-up surface), so this route does not branch on role and
// always presents the student flow.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
