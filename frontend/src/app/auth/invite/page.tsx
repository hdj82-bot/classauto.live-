import { Suspense } from "react";
import InviteContent from "./InviteContent";

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteContent />
    </Suspense>
  );
}
