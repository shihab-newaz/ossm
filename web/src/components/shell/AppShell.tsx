import type { ReactNode } from "react";
import { ToastHost } from "@/components/ui/ToastHost";
import { Shortcuts } from "@/player/Shortcuts";
import { PlayerBar } from "./PlayerBar";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Content never hides behind the player: player height + 24px (+ tab bar on mobile). */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-[calc(var(--player-height)+var(--tabbar-height)+24px)] md:px-6 lg:px-8 lg:pb-[calc(var(--player-height)+24px)]">
          {children}
        </main>
      </div>
      <PlayerBar />
      <TabBar />
      <ToastHost />
      <Shortcuts />
    </div>
  );
}
