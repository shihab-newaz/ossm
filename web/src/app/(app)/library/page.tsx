import type { Metadata } from "next";
import { LibraryScreen } from "@/library/LibraryScreen";

export const metadata: Metadata = { title: "Library · OSSM" };

export default function LibraryPage() {
  return <LibraryScreen />;
}
