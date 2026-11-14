import { Component, type ErrorInfo, type ReactNode } from "react";
import ui from "./controls.module.css";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled render error:", error, errorInfo);
  }

  private handleResetCache = () => {
    try {
      // Clear site layout cache
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("ip.siteLayout.") || key.startsWith("ip."))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            background: "#0f1419",
            color: "#e6edf3",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: "0 0 12px 0", color: "#f87171" }}>
            {this.props.fallbackTitle ?? "خطا در پردازش و نمایش صفحه"}
          </h2>
          <p style={{ maxWidth: 500, margin: "0 0 24px 0", color: "#8b98a5", lineHeight: 1.6 }}>
            یک خطای پیش‌بینی‌نشده در بارگذاری المان‌های صفحه رخ داده است. می‌توانید صفحه را مجدداً بارگذاری کنید یا
            حافظهٔ محلی تنظیمات قالب را بازنشانی فرمایید.
          </p>
          {this.state.error && (
            <pre
              dir="ltr"
              style={{
                maxWidth: 600,
                padding: "10px 16px",
                background: "rgba(0,0,0,0.5)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fca5a5",
                fontSize: "0.8rem",
                overflowX: "auto",
                marginBottom: 24,
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              className={`${ui.button} ${ui.primary}`}
              onClick={() => window.location.reload()}
            >
              🔄 بارگذاری مجدد صفحه
            </button>
            <button
              type="button"
              className={ui.button}
              onClick={this.handleResetCache}
            >
              🧹 بازنشانی تنظیمات موقت قالب
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

