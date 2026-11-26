import { useEffect } from 'react';

/** Layar TV tidak bisa di-scroll manual: bila isi lebih tinggi dari layar, geser pelan ke bawah lalu kembali ke atas. */
const PAUSE_MS = 8000; // jeda di atas dan di bawah
const SPEED_PX_PER_S = 40; // kecepatan geser
const RECHECK_MS = 10000; // cek ulang bila isi muat satu layar

export function TvAutoScroll() {
  useEffect(() => {
    const el = document.scrollingElement ?? document.documentElement;
    let cancelled = false;
    let raf = 0;
    let timer = 0;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });
    const glideTo = (to: number) =>
      new Promise<void>((resolve) => {
        const from = el.scrollTop;
        const dur = (Math.abs(to - from) / SPEED_PX_PER_S) * 1000;
        const t0 = performance.now();
        const step = (t: number) => {
          if (cancelled) return;
          const p = dur <= 0 ? 1 : Math.min(1, (t - t0) / dur);
          el.scrollTop = from + (to - from) * p;
          if (p < 1) raf = requestAnimationFrame(step);
          else resolve();
        };
        raf = requestAnimationFrame(step);
      });
    void (async () => {
      while (!cancelled) {
        el.scrollTop = 0;
        await wait(PAUSE_MS);
        const max = el.scrollHeight - el.clientHeight;
        if (cancelled) return;
        if (max <= 8) {
          await wait(RECHECK_MS);
          continue;
        }
        await glideTo(max);
        await wait(PAUSE_MS);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
