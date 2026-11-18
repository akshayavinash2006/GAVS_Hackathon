"use client";

import { Camera, Check, CheckCheck, ClipboardList, Home, MessageCircle, Package } from "lucide-react";
import { useEffect, useRef } from "react";

// The product itself, in 3D: a phone running the dashboard, with the moments
// that matter floating in front at different depths. Pure CSS 3D: the stage
// leans toward the pointer and sways gently when idle.

const z = (px: number): React.CSSProperties => ({ transform: `translateZ(${px}px)` });

export function HeroShowcase() {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const base = { x: -16, y: 7 };
    if (reduce) {
      el.style.transform = `rotateX(${base.y}deg) rotateY(${base.x}deg)`;
      return;
    }
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let visible = true;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(el);
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const t = (now - t0) / 1000;
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      const ry = base.x + cur.x * 14 + Math.sin(t * 0.5) * 3;
      const rx = base.y - cur.y * 8 + Math.cos(t * 0.4) * 1.5;
      el.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className="absolute inset-0 grid place-items-center overflow-visible" aria-hidden>
      <div className="origin-center scale-[0.6] [perspective:1600px] sm:scale-[0.82] lg:scale-100">
        <div ref={stage} className="relative h-[520px] w-[252px] [transform-style:preserve-3d]" style={{ transform: "rotateX(7deg) rotateY(-16deg)" }}>
          {/* Glow + ground shadow behind the phone */}
          <div className="absolute -inset-24 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.35),rgba(34,211,238,0.12)_45%,transparent_70%)] blur-2xl" style={z(-180)} />
          <div className="absolute -bottom-16 left-1/2 h-10 w-72 -translate-x-1/2 rounded-[50%] bg-black/70 blur-2xl" style={z(-120)} />

          <Phone />

          {/* Floating moments */}
          <Layer className="-left-[150px] top-[96px]" depth={150} delay="0s">
            <div className="w-[220px] rounded-3xl border border-white/10 bg-[#151a21] p-3.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-critical-soft text-critical">
                  <div className="text-center leading-none">
                    <div className="text-base font-bold">5</div>
                    <div className="text-[8px] font-semibold">DAYS</div>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">Boost 500g</div>
                  <div className="text-xs text-ink-3">6 pcs · ₹1,657 at risk</div>
                </div>
              </div>
              <div className="mt-3 inline-flex rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning-text">Sell at ₹242 (−15%)</div>
            </div>
          </Layer>

          <Layer className="-right-[214px] top-[14px]" depth={200} delay="1.1s">
            <div className="w-[236px] rounded-3xl border border-white/10 bg-[#0d1512] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]">
              <div className="mb-2 flex items-center gap-2 px-1 text-[11px] text-ink-3">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#25d366]">
                  <MessageCircle className="h-3 w-3 text-[#04140d]" />
                </span>
                WhatsApp · Dukaan Saathi
              </div>
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#005c4b] px-3 py-1.5 text-[12.5px] text-[#e9fdf6]">Maggi khatam ho gaya 🙏</div>
              <div className="mt-1.5 w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-[#1f2c33] px-3 py-1.5 text-[12.5px] text-[#e9edef]">
                Noted ✅ 96 pcs added to Thursday&apos;s draft. Reply <b>HAAN</b> to approve.
              </div>
            </div>
          </Layer>

          <Layer className="-right-[196px] bottom-[70px]" depth={110} delay="2.2s">
            <div className="flex w-[210px] items-center gap-3 rounded-3xl border border-good/25 bg-[#111a16] p-3.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-good-soft text-good-text">
                <CheckCheck className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold">Order approved</div>
                <div className="text-xs text-ink-3">₹13,322 · within budget</div>
              </div>
            </div>
          </Layer>

          <Layer className="-left-[96px] bottom-[34px]" depth={230} delay="0.6s">
            <div className="rounded-full border border-white/10 bg-[#1a1e26] px-3.5 py-2 text-xs shadow-[0_20px_40px_-15px_rgba(0,0,0,0.9)]">
              🪔 Festival demand <b className="text-brand">×1.8</b>
            </div>
          </Layer>
        </div>
      </div>
    </div>
  );
}

function Layer({ className, depth, delay, children }: { className: string; depth: number; delay: string; children: React.ReactNode }) {
  return (
    <div className={`absolute ${className}`} style={z(depth)}>
      <div className="floaty" style={{ ["--fd" as string]: delay }}>
        {children}
      </div>
    </div>
  );
}

/** A miniature of the real dashboard. */
function Phone() {
  return (
    <div className="absolute inset-0 rounded-[2.6rem] bg-gradient-to-b from-[#2a2f38] to-[#14171c] p-[7px] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.95)]" style={z(0)}>
      <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-[#0a0c10] ring-1 ring-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(18rem_10rem_at_100%_0%,rgba(34,211,238,0.12),transparent),radial-gradient(16rem_10rem_at_0%_0%,rgba(52,211,153,0.12),transparent)]" />
        <div className="relative px-3.5 pt-3 text-[10px]">
          {/* status bar + notch */}
          <div className="flex items-center justify-between text-[9px] font-semibold text-ink-2">
            <span>9:41</span>
            <span className="h-4 w-16 rounded-full bg-black" />
            <span>5G ▮▮▮</span>
          </div>

          <div className="mt-3 text-[9px] text-ink-3">Wednesday, 18 Nov</div>
          <div className="text-[15px] font-semibold leading-tight">Namaste, Rajesh 🙏</div>

          <div className="mt-2.5 rounded-2xl border border-critical/30 bg-[radial-gradient(14rem_6rem_at_0%_0%,rgba(242,107,107,0.2),transparent),#12151b] p-2.5">
            <div className="flex items-center gap-1.5 text-[9px] text-ink-2">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-critical" /> At risk of expiry
            </div>
            <div className="text-[26px] font-semibold leading-none tracking-tight">₹4,399</div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[
                ["Out", "15"],
                ["Low", "8"],
                ["Slow", "₹6k"],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-black/30 px-1.5 py-1">
                  <div className="text-[8px] text-ink-3">{l}</div>
                  <div className="text-[11px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2.5 text-[11px] font-semibold">Act now</div>
          <div className="mt-1 flex gap-1.5">
            {[
              ["12", "MTR Rava Idli", "Return", "bg-warning-soft text-warning-text", "bg-series-1/15 text-[#7fb2f0]"],
              ["16", "Dettol Handwash", "Return", "bg-warning-soft text-warning-text", "bg-series-1/15 text-[#7fb2f0]"],
            ].map(([d, n, a, dc, ac]) => (
              <div key={n} className="w-[112px] shrink-0 rounded-xl border border-white/5 bg-[#12151b] p-2">
                <div className={`grid h-7 w-7 place-items-center rounded-lg text-[11px] font-bold ${dc}`}>{d}</div>
                <div className="mt-1.5 truncate text-[10px] font-medium">{n}</div>
                <div className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${ac}`}>{a}</div>
              </div>
            ))}
          </div>

          <div className="mt-2.5 rounded-2xl border border-white/5 bg-[#12151b] p-2.5">
            <div className="text-[8px] text-ink-3">Left this week</div>
            <div className="text-[16px] font-semibold leading-tight">₹14,280</div>
            <div className="mt-1.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-surface-3">
              <div className="h-full w-[21%] rounded-l-full bg-series-2" />
            </div>
          </div>

          <div className="btn-glow mt-2.5 flex items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold text-brand-ink">
            <Check className="h-3 w-3" /> Create draft · ₹14,279
          </div>
        </div>

        {/* mini tab bar */}
        <div className="absolute inset-x-2.5 bottom-2.5 grid grid-cols-5 items-center rounded-2xl border border-white/10 bg-[#12151b]/95 py-1.5 text-ink-3">
          {[Home, Package, Camera, ClipboardList, MessageCircle].map((Icon, i) =>
            i === 2 ? (
              <span key={i} className="btn-glow mx-auto -my-3 grid h-8 w-8 place-items-center rounded-xl text-brand-ink">
                <Icon className="h-4 w-4" />
              </span>
            ) : (
              <Icon key={i} className={`mx-auto h-3.5 w-3.5 ${i === 0 ? "text-brand" : ""}`} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
