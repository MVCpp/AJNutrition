/**
 * Full-screen loading state, visually identical to the boot splash in
 * index.html so the hand-off from "bundle parsing" to "asking the main
 * process for the auth status" is one continuous screen rather than a flash.
 *
 * `motion-reduce:` variants stop the animation for anyone who asked the OS
 * for reduced motion.
 */
export function LoadingScreen({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-br from-emerald-950 via-emerald-800 to-emerald-700 text-emerald-50"
    >
      <div className="relative flex h-22 w-22 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-[3px] border-white/20" />
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-r-emerald-400 border-t-emerald-300 motion-reduce:animate-none motion-reduce:border-emerald-400" />
        <span aria-hidden="true" className="animate-pulse text-3xl motion-reduce:animate-none">
          🥗
        </span>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold">NutriPlan</p>
        <p className="text-xs text-emerald-100/75">{message}</p>
      </div>
    </div>
  );
}
