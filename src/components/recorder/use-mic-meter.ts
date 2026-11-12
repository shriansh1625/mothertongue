"use client";
/**
 * Live microphone level meter.
 * Taps the SAME MediaStream that MediaRecorder uses with an AudioContext + AnalyserNode.
 * - `levels` (0..1 per bar) is React state, throttled to ~20 updates/s, for <WaveBars levels>.
 * - `level` is a motion value (overall loudness 0..1) updated every frame without re-rendering,
 *   for driving transforms like the record-button halo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue } from "motion/react";

const UPDATE_MS = 50; // ~20 updates per second

export function useMicMeter(bars = 28) {
  const [levels, setLevels] = useState<number[] | undefined>(undefined);
  const level = useMotionValue(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try {
      srcRef.current?.disconnect();
    } catch {}
    srcRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    level.set(0);
    setLevels(undefined);
  }, [level]);

  const start = useCallback(
    (stream: MediaStream) => {
      stop();
      const AC: typeof AudioContext | undefined =
        typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return; // meter is a nice-to-have; recording still works without it
      try {
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.72;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -20;
        src.connect(analyser); // analyser is not connected to destination: no echo
        ctxRef.current = ctx;
        srcRef.current = src;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});

        const freq = new Uint8Array(analyser.frequencyBinCount);
        const time = new Uint8Array(analyser.fftSize);
        // voice energy lives roughly between 80 Hz and 4 kHz
        const hzPerBin = ctx.sampleRate / analyser.fftSize;
        const lo = Math.max(1, Math.floor(80 / hzPerBin));
        const hi = Math.min(freq.length - 1, Math.ceil(4000 / hzPerBin));
        const half = Math.ceil(bars / 2);
        let last = 0;

        const tick = (now: number) => {
          rafRef.current = requestAnimationFrame(tick);
          analyser.getByteTimeDomainData(time);
          let sum = 0;
          for (let i = 0; i < time.length; i++) {
            const v = (time[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / time.length);
          level.set(Math.min(1, rms * 4));

          if (now - last < UPDATE_MS) return;
          last = now;
          analyser.getByteFrequencyData(freq);
          // half the bars from low to high frequency, mirrored so the waveform is centred
          const side: number[] = [];
          for (let b = 0; b < half; b++) {
            // log-ish spacing gives the low (voice fundamental) range more bars
            const a = lo + Math.floor((hi - lo) * Math.pow(b / half, 1.6));
            const z = Math.max(a + 1, lo + Math.floor((hi - lo) * Math.pow((b + 1) / half, 1.6)));
            let peak = 0;
            for (let k = a; k < z && k < freq.length; k++) peak = Math.max(peak, freq[k]);
            side.push(Math.min(1, Math.pow(peak / 255, 1.4) * 1.15));
          }
          const mirrored = [...side.slice().reverse(), ...side].slice(0, bars);
          setLevels(mirrored);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        stop();
      }
    },
    [bars, level, stop],
  );

  useEffect(() => stop, [stop]);

  return { levels, level, start, stop };
}
