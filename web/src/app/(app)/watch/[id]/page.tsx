import type { Metadata } from "next";
import { WatchScreen } from "@/videos/WatchScreen";

export const metadata: Metadata = { title: "Watch · OSSM" };

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchScreen id={id} />;
}
