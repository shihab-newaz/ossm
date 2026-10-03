import type { Metadata } from "next";
import { AlbumScreen } from "@/library/AlbumScreen";

export const metadata: Metadata = { title: "Album · OSSM" };

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AlbumScreen id={id} />;
}
