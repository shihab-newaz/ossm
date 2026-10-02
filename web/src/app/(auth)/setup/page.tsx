import type { Metadata } from "next";
import { SetupForm } from "@/auth/SetupForm";

export const metadata: Metadata = { title: "Set up · OSSM" };

export default function SetupPage() {
  return <SetupForm />;
}
