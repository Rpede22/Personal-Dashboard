"use client";

import React from "react";

interface Props {
  /** Human-readable label used in the fallback message ("Sports", "School", …). */
  label: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  key: number; // bumped on retry to force children to remount
}

/**
 * React error boundary for a single dashboard widget.
 *
 * A crash inside one Card (bad API response, undefined field access, whatever)
 * shouldn't take down the whole dashboard — every other widget stays live.
 * Fallback UI shows the error text with a retry button that remounts the child.
 *
 * Only rendering errors get caught here; async/promise errors need to be
 * handled by the widget itself (setError state or try/catch on fetch).
 */
export default class WidgetErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, key: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface in devtools; don't hide it.
    console.error(`[widget:${this.props.label}] crashed`, error, info);
  }

  retry = () => {
    this.setState((s) => ({ error: null, key: s.key + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <div
          className="rounded-2xl p-4 h-full flex flex-col justify-center gap-3"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--accent-red)44",
          }}
        >
          <div>
            <div className="font-semibold" style={{ color: "var(--accent-red)" }}>
              {this.props.label} widget crashed
            </div>
            <div className="text-xs mt-1 font-mono break-words" style={{ color: "var(--text-muted)" }}>
              {this.state.error.message || String(this.state.error)}
            </div>
          </div>
          <button
            onClick={this.retry}
            className="text-xs px-3 py-1.5 rounded-md font-medium self-start"
            style={{ background: "var(--accent-red)", color: "#fff" }}
          >
            ↻ Retry
          </button>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Other widgets on the dashboard are unaffected.
          </p>
        </div>
      );
    }
    return <div key={this.state.key} className="contents">{this.props.children}</div>;
  }
}
