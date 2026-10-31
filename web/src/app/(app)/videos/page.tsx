import type { Metadata } from "next";
import { VideosScreen } from "@/video/VideosScreen";

export const metadata: Metadata = { title: "Videos · OSSM" };

export default function VideosPage() {
  return <VideosScreen />;
}
