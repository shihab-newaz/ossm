"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { reporter } from "@/events/reporter";
import { player } from "@/player/player";
import { consumeLoggedOutOnPurpose, useMe, useSetupStatus } from "./session";

/**
 * Keeps signed-out people out of the app. With no session it sends them to first-run setup (a brand
 * new instance) or to login, remembering the page they wanted so login can return them there.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const signedOut = me.data === null;
  const setup = useSetupStatus(signedOut);

  // Nobody is signed in: stop the music, forget the queue and any unsent playback events, so it is not left playing behind the login page or inherited by the next person.
  useEffect(() => {
    if (!signedOut) return;
    player.stop();
    reporter.clear();
  }, [signedOut]);

  useEffect(() => {
    if (!signedOut || !setup.data) return;
    if (setup.data.setupRequired) {
      router.replace("/setup");
    } else {
      const wanted = pathname + window.location.search;
      const plain = consumeLoggedOutOnPurpose() || wanted === "/";
      router.replace(plain ? "/login" : `/login?next=${encodeURIComponent(wanted)}`);
    }
  }, [signedOut, setup.data, pathname, router]);

  if (me.isError || setup.isError) {
    return (
      <p role="alert" className="grid min-h-dvh place-items-center px-4 text-center text-fg-muted">
        Can&apos;t reach the OSSM server. Check that it is running, then reload.
      </p>
    );
  }
  if (!me.data) {
    return (
      <p role="status" className="grid min-h-dvh place-items-center text-fg-subtle">
        Loading…
      </p>
    );
  }
  return <>{children}</>;
}
