import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchScreen } from "@/search/SearchScreen";

export const metadata: Metadata = { title: "Search · OSSM" };

export default function SearchPage() {
  // useSearchParams opts the screen out of static rendering, so it needs a Suspense boundary.
  return (
    <Suspense>
      <SearchScreen />
    </Suspense>
  );
}
