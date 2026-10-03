import type { Metadata } from "next";
import { IngestFailures } from "@/admin/IngestFailures";

export const metadata: Metadata = { title: "Failed uploads · OSSM" };

export default function IngestFailuresPage() {
  return <IngestFailures />;
}
