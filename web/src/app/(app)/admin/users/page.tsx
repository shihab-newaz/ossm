import type { Metadata } from "next";
import { UsersAdmin } from "@/admin/UsersAdmin";

export const metadata: Metadata = { title: "Users · OSSM" };

export default function UsersPage() {
  return <UsersAdmin />;
}
