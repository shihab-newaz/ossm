import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-8 px-4 py-10">
      <Logo />
      {children}
      <div className="self-start">
        <ThemeSwitcher />
      </div>
    </main>
  );
}
