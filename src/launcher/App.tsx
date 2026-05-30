export function App() {
  const handleStart = () => {
    window.companion?.startMission();
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-ninja-mist font-cozy text-ninja-ink">
      <h1 className="mb-2 text-3xl font-semibold tracking-[0.35em]">NINJA</h1>
      <p className="mb-10 text-xs text-ninja-ink/50">静かに、そばにいる。</p>
      <button
        type="button"
        onClick={handleStart}
        className="rounded-full bg-ninja-ink px-8 py-3 text-sm text-ninja-mist transition hover:bg-ninja-accent active:scale-95"
      >
        🥷 START MISSION
      </button>
    </div>
  );
}
