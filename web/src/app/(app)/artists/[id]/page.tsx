import type { Metadata } from "next";
import { ArtistScreen } from "@/library/ArtistScreen";

export const metadata: Metadata = { title: "Artist · OSSM" };

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArtistScreen id={id} />;
}
