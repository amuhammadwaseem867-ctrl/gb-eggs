/** Fixed, softly drifting colour orbs behind the glass surfaces. Pure CSS; honours reduced motion. */
export function AppBackground() {
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="gb-orb absolute -top-40 -left-32 size-[34rem] rounded-full bg-[oklch(0.82_0.13_162/0.45)] blur-[110px]" />
      <div className="gb-orb absolute -top-24 right-[-10rem] size-[30rem] rounded-full bg-[oklch(0.9_0.13_85/0.5)] blur-[110px] [animation-delay:-6s]" />
      <div className="gb-orb absolute bottom-[-12rem] left-[30%] size-[36rem] rounded-full bg-[oklch(0.82_0.09_240/0.4)] blur-[120px] [animation-delay:-11s]" />
      <div className="gb-orb absolute right-[-6rem] bottom-[10%] size-[22rem] rounded-full bg-[oklch(0.82_0.11_300/0.3)] blur-[100px] [animation-delay:-3s]" />
      <div className="absolute inset-0 bg-[radial-gradient(oklch(0.25_0.05_266/0.05)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
    </div>
  );
}
