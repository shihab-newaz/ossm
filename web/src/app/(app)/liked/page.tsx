import type { Metadata } from "next";
import { LikedScreen } from "@/favorites/LikedScreen";

export const metadata: Metadata = { title: "Liked · OSSM" };

export default function LikedPage() {
  return <LikedScreen />;
}
