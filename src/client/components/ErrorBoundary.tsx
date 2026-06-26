import { Button, Text } from "@cloudflare/kumo";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <Text variant="heading3" as="h1" DANGEROUS_className="m-0">
            页面加载出错
          </Text>
          <Text variant="secondary" as="p" DANGEROUS_className="m-0 max-w-md">
            {this.state.error}
          </Text>
          <Button variant="primary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}