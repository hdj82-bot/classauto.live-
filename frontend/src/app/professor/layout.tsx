"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Header from "@/components/Header";

export default function ProfessorLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={["professor"]}>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </div>
    </ProtectedRoute>
  );
}
