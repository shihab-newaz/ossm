import type { Metadata } from "next";
import { ShowScreen } from "@/video/ShowScreen";

export const metadata: Metadata = { title: "Show · OSSM" };

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShowScreen id={id} />;
}
