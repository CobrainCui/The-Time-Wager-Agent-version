import React from "react";
import { uiRem } from "../utils/typography";

interface Props {
  children: React.ReactNode;
  onClose: () => void;
}

export class PreviewErrorBoundary extends React.Component<
  Props,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="page-center"
          style={{
            flex: 1,
            padding: "2rem",
            textAlign: "center",
            color: "var(--color-text-secondary)",
          }}
        >
          <p style={{ fontWeight: 700, color: "#f87171", marginBottom: "0.75rem" }}>
            预览页面加载失败
          </p>
          <p style={{ fontSize: uiRem(0.85), marginBottom: "1.25rem" }}>
            {this.state.error.message}
          </p>
          <button type="button" className="btn btn-primary" onClick={this.props.onClose}>
            返回大厅
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
