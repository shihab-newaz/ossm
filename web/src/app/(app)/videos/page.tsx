import type { Metadata } from "next";
import { VideosScreen } from "@/videos/VideosScreen";

export const metadata: Metadata = { title: "Videos · OSSM" };

export default function VideosPage() {
  return <VideosScreen />;
}
