import type { Metadata } from "next";
import { UploadScreen } from "@/upload/UploadScreen";

export const metadata: Metadata = { title: "Upload · OSSM" };

export default function UploadPage() {
  return <UploadScreen />;
}
