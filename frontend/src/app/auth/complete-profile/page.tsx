import { Suspense } from "react";
import CompleteProfileContent from "./CompleteProfileContent";

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={null}>
      <CompleteProfileContent />
    </Suspense>
  );
}
