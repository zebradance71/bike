import { branding } from "../branding";
import blockIdleUrl from "../companion/assets/frames/block-idle.png";

export function App() {
  const handleStart = () => {
    window.companion?.startMission();
  };

  const title = branding.displayName.toUpperCase();

  return (
    <div className="flex h-full flex-col items-center justify-center bg-ninja-mist font-cozy text-ninja-ink">
      <h1 className="mb-2 text-3xl font-semibold tracking-[0.35em]">{title}</h1>
      <p className="mb-10 text-xs tracking-wide text-ninja-ink/50">
        Let&apos;s rip it, baby.
      </p>
      <button
        type="button"
        onClick={handleStart}
        className="launcher-start-ride group flex items-center gap-3 rounded-full border border-ninja-ink/12 bg-white px-5 py-2 pl-3 shadow-[0_4px_14px_rgba(26,26,46,0.12)] transition hover:border-ninja-accent/35 hover:shadow-[0_6px_20px_rgba(196,92,62,0.22)] active:scale-[0.98]"
      >
        <img
          src={blockIdleUrl}
          alt=""
          className="launcher-start-ride__bike h-11 w-11 shrink-0 object-contain object-bottom"
          draggable={false}
        />
        <span className="pr-1 text-sm font-bold tracking-[0.22em] text-ninja-ink group-hover:text-ninja-accent">
          START RIDE
        </span>
      </button>
    </div>
  );
}
