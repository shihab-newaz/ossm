import type { Metadata } from "next";
import { SettingsPage } from "@/auth/SettingsPage";

export const metadata: Metadata = { title: "Settings · OSSM" };

export default function Page() {
  return <SettingsPage />;
}
