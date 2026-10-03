import type { Metadata } from "next";
import { ExploreScreen } from "@/explore/ExploreScreen";

export const metadata: Metadata = { title: "Explore · OSSM" };

export default function ExplorePage() {
  return <ExploreScreen />;
}
