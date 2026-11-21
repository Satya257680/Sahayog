import React from "react";
import { BrandLogo } from "./brand";

/**
 * Last-resort boundary around the whole app (see main.jsx).
 *
 * Without it, any error thrown while rendering (for example in BootGate or a provider) unmounts
 * the tree and leaves a blank white page. With it, the visitor gets a branded screen with a way
 * forward. React still reports the original error in the console; nothing is suppressed.
 *
 * The fallback deliberately uses no hooks, no context and no router: it must keep working when
 * those are what failed. It reuses the start-up screen's styles (splash.css).
 */
export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = String(error?.message || error);
    // "Invalid hook call" / "reading 'useContext'" almost always means two copies of React were
    // loaded, usually from a stale Vite dependency cache during development.
    const looksLikeDuplicateReact =
      /useContext|useState|useRef|useEffect|Invalid hook call/i.test(message);

    return (
      <div className="boot-splash boot-splash--fallback" role="alert">
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

          <p className="boot-splash__status">Something went wrong.</p>
          <div className="boot-splash__error">
            <p>
              Sahayog could not load this page. Reloading usually fixes it. If
              it keeps happening, go back to the home page.
            </p>
            <div className="boot-splash__actions">
              <button
                type="button"
                className="boot-splash__btn boot-splash__btn--primary"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
              {/* A plain link, not <Link>: the router may be what failed. */}
              <a className="boot-splash__btn boot-splash__link" href="/">
                Go to home page
              </a>
            </div>
          </div>

          {import.meta.env.DEV && (
            <details className="boot-splash__dev">
              <summary>Developer details</summary>
              <pre>{message}</pre>
              {looksLikeDuplicateReact && (
                <p>
                  This usually means two copies of React were loaded. Stop the
                  dev server, delete <code>client/node_modules/.vite</code>, run{" "}
                  <code>npm ls react react-dom</code> in <code>client/</code>{" "}
                  (each should appear once), then start the dev server again.
                </p>
              )}
            </details>
          )}
        </div>
      </div>
    );
  }
}
