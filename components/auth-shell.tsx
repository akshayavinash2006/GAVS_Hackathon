import Link from "next/link";

/** Shared frame for login / sign-up: logo, glow, centred card. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="btn-glow grid h-9 w-9 place-items-center rounded-xl text-sm font-black text-brand-ink">DS</span>
        <span className="font-semibold tracking-tight">Dukaan Saathi</span>
      </Link>
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="rise text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="rise mt-1 text-ink-3" style={{ ["--d" as string]: "40ms" }}>
            {subtitle}
          </p>
        )}
        <div className="rise mt-8" style={{ ["--d" as string]: "80ms" }}>
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-ink-3">{footer}</div>}
      </div>
    </main>
  );
}
