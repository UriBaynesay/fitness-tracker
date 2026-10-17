import { useEffect } from "react";
import { readDeviceSettings } from "./device";

// Browsers only let a page start audio after a tap, so the audio context is created
// (and resumed) from the "Complete set" tap; by the time rest ends, it is allowed.
let audio: AudioContext | null = null;

export function primeAudio(): void {
  try {
    if (!readDeviceSettings().sound) return;
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // No Web Audio: the vibration and the screen still tell the person.
  }
}

function beep(): void {
  if (!audio || audio.state !== "running") return;
  const now = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + i * 0.22);
    gain.gain.exponentialRampToValueAtTime(0.35, now + i * 0.22 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.16);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now + i * 0.22);
    oscillator.stop(now + i * 0.22 + 0.18);
  }
}

// The rest is over: a short triple beep and a buzz, each if this device allows it.
export function restOverAlert(): void {
  const settings = readDeviceSettings();
  if (settings.sound) beep();
  if (settings.vibration && "vibrate" in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
}

// Keeps the screen on while `active`. The lock is released by the browser whenever
// the tab is hidden, so it is requested again when the tab comes back.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !readDeviceSettings().keepAwake || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (cancelled) void lock.release();
          else sentinel = lock;
        })
        .catch(() => {
          // Denied (low battery, not visible): not worth bothering the person.
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active]);
}
