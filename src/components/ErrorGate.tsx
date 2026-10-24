import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorGateProps {
  children: ReactNode;
  label: string;
}

interface ErrorGateState {
  error: Error | null;
}

/**
 * Render errors used to unmount the whole window: a transparent, shadow-only
 * frame that blocks the desktop. Catch them here instead and show a short
 * message with a reload, so one bad message cannot brick the window.
 * Diagnostics still records the original error.
 */
export default class ErrorGate extends Component<
  ErrorGateProps,
  ErrorGateState
> {
  constructor(props: ErrorGateProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorGateState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.label} crashed`, error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="error-gate" role="alert">
        <p>窗口渲染出错了</p>
        <p className="error-gate-detail">{error.message}</p>
        <button
          className="settings-btn"
          type="button"
          onClick={() => location.reload()}
        >
          重新加载窗口
        </button>
      </main>
    );
  }
}
