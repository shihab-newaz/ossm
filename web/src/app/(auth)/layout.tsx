import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-8 px-4 py-10">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-8 place-items-center rounded-card bg-fg font-display font-extrabold text-bg">
          O
        </span>
        <span className="font-display text-xl font-extrabold tracking-tight">OSSM</span>
      </div>
      {children}
      <div className="self-start">
        <ThemeSwitcher />
      </div>
    </main>
  );
}
