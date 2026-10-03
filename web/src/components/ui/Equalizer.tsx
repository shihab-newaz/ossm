/** The animated three-bar "now playing" mark. Still when paused, and for people who asked for less motion. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden data-testid="equalizer" data-playing={playing} className="eq inline-flex h-4 items-end gap-[2px]">
      <span className="eq-bar" />
      <span className="eq-bar" />
      <span className="eq-bar" />
    </span>
  );
}
