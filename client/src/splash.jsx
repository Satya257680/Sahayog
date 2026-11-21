import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import { BrandLogo } from "./brand";

/**
 * Branded start-up screen shown once per page load while the app boots.
 *
 * Rules (see CLAUDE.md §3 and the UI brief):
 * - Visible until BOTH the auth/session check has resolved AND a short minimum time has passed,
 *   so a first-time visitor can see the hand-off animation. Never held after that.
 * - The full minimum only applies to the first load in a browser tab session. Later reloads in the
 *   same tab show nothing for fast starts, and the splash only if start-up is slow (no flash).
 * - Not shown on in-app route changes: this wraps the router once, at the root.
 * - Progress is shown as an indeterminate bar. No percentage is claimed.
 * - If the session check fails (network / server error) the user gets "Try again" or "Continue",
 *   instead of a frozen screen.
 */

const SEEN_KEY = "sahayog:splash-seen";
const MIN_FIRST_VISIT_MS = 4100; // 3.6 s animation + 0.5 s hold of the completed hand-off
const MIN_REDUCED_MOTION_MS = 1200;
const REPEAT_VISIT_DELAY_MS = 300; // repeat loads: only show the splash if start-up is slower than this
const SLOW_START_MS = 10000;
const FADE_MS = 280;

function readSeen() {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false; // storage blocked: treat as a first visit
  }
}
function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage blocked: harmless, the splash simply shows again next load */
  }
}
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function BootGate({ children }) {
  const { ready, bootError, refresh } = useAuth();
  // Read once per page load; StrictMode re-renders must not change the decision.
  const [firstVisit] = useState(() => !readSeen());
  const [reduced] = useState(prefersReducedMotion);
  const [minDone, setMinDone] = useState(false);
  const [visible, setVisible] = useState(firstVisit); // repeat visits start hidden (white)
  const [slow, setSlow] = useState(false);
  const [continued, setContinued] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [phase, setPhase] = useState("boot"); // boot → leaving → done

  useEffect(() => {
    const minMs = !firstVisit
      ? 0
      : reduced
        ? MIN_REDUCED_MOTION_MS
        : MIN_FIRST_VISIT_MS;
    const timers = [
      window.setTimeout(() => setMinDone(true), minMs),
      window.setTimeout(() => setSlow(true), SLOW_START_MS),
    ];
    if (!firstVisit)
      timers.push(
        window.setTimeout(() => setVisible(true), REPEAT_VISIT_DELAY_MS),
      );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [firstVisit, reduced]);

  // "Continue" is an explicit user choice, so it skips the remaining minimum time.
  const canLeave = ready && !retrying && (continued || (minDone && !bootError));

  // Leave once start-up is complete. The fade itself is timed by the next effect.
  useEffect(() => {
    if (phase !== "boot" || !canLeave) return;
    markSeen();
    setPhase(visible ? "leaving" : "done"); // splash never appeared: nothing to fade
  }, [canLeave, phase, visible]);

  // One timer owns the fade; with reduced motion there is no fade, so the app shows at once.
  useEffect(() => {
    if (phase !== "leaving") return undefined;
    const t = window.setTimeout(() => setPhase("done"), reduced ? 0 : FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase, reduced]);

  async function retry() {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  }

  // Keep both slots in a fixed order so the splash is never remounted (no animation restart / flicker).
  return (
    <>
      {phase !== "boot" ? children : null}
      {phase !== "done" && visible ? (
        <SplashScreen
          leaving={phase === "leaving"}
          error={ready && bootError && !continued}
          slow={slow && !ready}
          retrying={retrying}
          onRetry={retry}
          onContinue={() => setContinued(true)}
        />
      ) : null}
    </>
  );
}

export function SplashScreen({
  leaving = false,
  error = false,
  slow = false,
  retrying = false,
  onRetry,
  onContinue,
}) {
  const retryRef = useRef(null);
  useEffect(() => {
    if (error) retryRef.current?.focus();
  }, [error]);

  let status = "Preparing Sahayog…";
  if (retrying) status = "Trying again…";
  else if (error) status = "We couldn't reach Sahayog.";
  else if (slow) status = "This is taking longer than usual…";

  return (
    <div
      className={`boot-splash${leaving ? " boot-splash--leaving" : ""}`}
      aria-hidden={leaving ? "true" : undefined}
      aria-busy={!error && !leaving ? "true" : undefined}
    >
      <div className="boot-splash__inner">
        <div className="boot-splash__brand">
          <BrandLogo size={72} alt="" className="boot-splash__logo" />
          <div className="boot-splash__wordmark">
            <span className="boot-splash__name">Sahayog</span>
            <span className="boot-splash__tagline">
              Give <span aria-hidden="true">·</span> Receive{" "}
              <span aria-hidden="true">·</span> Be Kind
            </span>
          </div>
        </div>

        <HandoverScene />

        <p className="boot-splash__status" role="status" aria-live="polite">
          {status}
        </p>

        {error ? (
          <div className="boot-splash__error">
            <p>
              Check your internet connection and try again. You can also
              continue and browse while signed out.
            </p>
            <div className="boot-splash__actions">
              <button
                ref={retryRef}
                type="button"
                className="boot-splash__btn boot-splash__btn--primary"
                onClick={onRetry}
                disabled={retrying}
                aria-busy={retrying}
              >
                Try again
              </button>
              <button
                type="button"
                className="boot-splash__btn"
                onClick={onContinue}
                disabled={retrying}
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div
            className="boot-splash__bar"
            role="progressbar"
            aria-label="Loading Sahayog"
          >
            <span />
          </div>
        )}

        {slow && !error && (
          <button
            type="button"
            className="boot-splash__btn boot-splash__reload"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * One person walks in carrying a box of essentials and hands it to another person, who reaches out,
 * takes it and reacts. Every moving part is its own SVG group, animated with CSS (see splash.css).
 * The final frame (no animation) is a calm "about to hand over" scene, used for reduced motion.
 */
function HandoverScene() {
  return (
    <svg
      className="handover"
      viewBox="0 0 640 280"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* Ground */}
      <path
        className="handover__ground"
        d="M40 252 H600"
        fill="none"
        strokeLinecap="round"
      />

      {/* Recipient (sitting, facing left) */}
      <g className="hv-recipient">
        <ellipse cx="402" cy="253" rx="48" ry="5" className="hv-shadow" />
        <path
          d="M366 251 C 366 228, 394 220, 426 222 C 438 224, 444 236, 444 251 Z"
          fill="#4b329a"
        />
        <rect x="383" y="156" width="36" height="76" rx="15" fill="#f2b544" />
        <g className="hv-recipient__head">
          <rect x="397" y="144" width="10" height="16" rx="4" fill="#b9805a" />
          <circle cx="403" cy="132" r="16" fill="#c98b62" />
          <circle cx="420" cy="117" r="8" fill="#26213d" />
          <path
            d="M387 131 C 386 112, 420 110, 420 133 C 413 124, 400 121, 391 128 Z"
            fill="#26213d"
          />
          <circle cx="394" cy="133" r="1.8" fill="#26213d" />
          <path
            d="M389 140 Q 393 144 398 140"
            fill="none"
            stroke="#7a3328"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>
        <g className="hv-recipient__arms">
          <path
            d="M405 170 Q 382 174 352 170"
            fill="none"
            stroke="#e0a232"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M397 166 Q 376 164 348 160"
            fill="none"
            stroke="#f2b544"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <circle cx="346" cy="160" r="6" fill="#c98b62" />
          <circle cx="349" cy="170" r="6" fill="#b9805a" />
        </g>
      </g>

      {/* Giver (walks in from the left) */}
      <g className="hv-giver">
        <ellipse cx="206" cy="253" rx="32" ry="5" className="hv-shadow" />
        <g className="hv-giver__body">
          <g className="hv-leg hv-leg--back">
            <path
              d="M204 176 L204 240"
              stroke="#23264f"
              strokeWidth="15"
              strokeLinecap="round"
            />
            <rect
              x="195"
              y="240"
              width="25"
              height="10"
              rx="5"
              fill="#eceaf4"
              stroke="#b8b1d2"
            />
          </g>
          <g className="hv-giver__arm-back">
            <path
              d="M200 124 Q 220 152 244 147"
              fill="none"
              stroke="#4a33a0"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <circle cx="246" cy="146" r="6" fill="#e2a07a" />
          </g>
          <g className="hv-leg hv-leg--front">
            <path
              d="M209 176 L209 240"
              stroke="#33386f"
              strokeWidth="15"
              strokeLinecap="round"
            />
            <rect
              x="200"
              y="240"
              width="25"
              height="10"
              rx="5"
              fill="#fbfaff"
              stroke="#b8b1d2"
            />
          </g>
          <rect x="188" y="110" width="38" height="72" rx="15" fill="#6247c0" />
          <rect x="190" y="168" width="34" height="16" rx="7" fill="#33386f" />
          <rect x="202" y="99" width="10" height="15" rx="4" fill="#e2a07a" />
          <circle cx="207" cy="88" r="16" fill="#f2b48c" />
          <path
            d="M191 88 C 188 68, 222 62, 225 80 C 217 76, 207 77, 200 83 L 197 94 Z"
            fill="#26213d"
          />
          <circle cx="215" cy="88" r="1.8" fill="#26213d" />
          <path
            d="M212 96 Q 216 99 220 95"
            fill="none"
            stroke="#8a3b2e"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g className="hv-giver__arm-front">
            <path
              d="M214 124 Q 232 154 250 151"
              fill="none"
              stroke="#7356d1"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <circle cx="252" cy="150" r="6" fill="#f2b48c" />
          </g>
        </g>
      </g>

      {/* The box: follows the giver's walk, then passes to the recipient */}
      <g className="hv-carry">
        <g className="hv-carry__bob">
          <g className="hv-box">
            <rect
              x="241"
              y="109"
              width="13"
              height="13"
              rx="3"
              fill="#f2c14e"
            />
            <rect
              x="253"
              y="106"
              width="12"
              height="16"
              rx="3"
              fill="#4a8fe0"
            />
            <rect
              x="265"
              y="110"
              width="12"
              height="12"
              rx="3"
              fill="#d9477f"
            />
            <rect
              x="236"
              y="118"
              width="46"
              height="34"
              rx="4"
              fill="#dba46a"
              stroke="#b8834f"
              strokeWidth="1.5"
            />
            <path d="M236 125 H282" stroke="#c48d55" strokeWidth="1.5" />
            <circle cx="259" cy="138" r="8" fill="#fff" />
            <path
              d="M259 142 C 252 137, 254 132, 257 133 C 258 133.4, 258.6 134, 259 134.8 C 259.4 134, 260 133.4, 261 133 C 264 132, 266 137, 259 142 Z"
              fill="#c2257a"
            />
          </g>
        </g>
      </g>

      {/* Positive reaction after the hand-off */}
      <g className="hv-heart">
        <path
          d="M372 104 C 360 95, 363 85, 369 86.5 C 370.5 87, 371.4 88, 372 89.4 C 372.6 88, 373.5 87, 375 86.5 C 381 85, 384 95, 372 104 Z"
          fill="#c2257a"
        />
      </g>
      <g
        className="hv-sparkles"
        stroke="#6247c0"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M354 92 L348 86" />
        <path d="M390 92 L396 86" />
        <path d="M372 78 L372 70" />
      </g>
    </svg>
  );
}
