"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { FormError } from "@/components/ui/form";
import { AdminGate } from "./AdminGate";

function useIngestFailures() {
  return useQuery({
    queryKey: ["admin", "ingest-failures"],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/admin/ingest-failures");
      if (!data) throw new Error("Could not load failed uploads");
      return data;
    },
  });
}

export function IngestFailures() {
  return <AdminGate>{() => <Failures />}</AdminGate>;
}

function Failures() {
  const failures = useIngestFailures();
  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Failed uploads</h1>
      <p className="max-w-prose text-fg-muted">Uploads that could not be added to the library, with the reason. The person who uploaded can retry from their Upload page.</p>
      {failures.isError ? <FormError>Could not load failed uploads.</FormError> : null}
      {failures.isPending ? <p className="text-fg-subtle">Loading…</p> : null}
      {failures.data && failures.data.length === 0 ? <p className="text-fg-muted">No failed uploads. Everything made it in.</p> : null}
      {failures.data && failures.data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <caption className="sr-only">Failed uploads</caption>
            <thead className="text-[12px] uppercase tracking-[0.06em] text-fg-subtle">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">File</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Uploaded by</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Reason</th>
                <th scope="col" className="py-2 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {failures.data.map((failure) => (
                <tr key={failure.uploadId} className="border-t border-border align-top">
                  <th scope="row" className="py-3 pr-4 font-semibold">
                    {failure.filename}
                  </th>
                  <td className="py-3 pr-4">{failure.username}</td>
                  <td className="py-3 pr-4 text-danger">{failure.error}</td>
                  <td className="py-3 text-fg-muted">{new Date(failure.failedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
