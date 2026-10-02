import type { Metadata } from "next";
import { AcceptInviteForm } from "@/auth/AcceptInviteForm";

export const metadata: Metadata = { title: "Join · OSSM" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInviteForm token={token} />;
}
