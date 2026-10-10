import type { Metadata } from "next";
import { HistoryScreen } from "@/favorites/HistoryScreen";

export const metadata: Metadata = { title: "History · OSSM" };

export default function HistoryPage() {
  return <HistoryScreen />;
}
