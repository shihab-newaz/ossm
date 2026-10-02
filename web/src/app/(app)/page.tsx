import { HealthIndicator } from "@/components/HealthIndicator";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-4 py-10">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">
        Welcome to OSSM
      </h1>
      <p className="max-w-prose text-fg-muted">
        Your music, on your own server. Upload some files to get started once the library arrives.
      </p>
      <HealthIndicator />
    </div>
  );
}
