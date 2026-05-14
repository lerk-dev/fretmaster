'use client'

import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  componentName?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo })
    console.error('ErrorBoundary caught:', error, errorInfo)

    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    if (typeof window !== 'undefined' && (window as any).__fmerrors) {
      (window as any).__fmerrors.push(
        `[ErrorBoundary${this.props.componentName ? ' ' + this.props.componentName : ''}] ${error.message}`
      )
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[200px] items-center justify-center p-4">
          <div className="max-w-md w-full rounded-lg border border-red-200 bg-red-50 p-5 text-center dark:border-red-800 dark:bg-red-950">
            <div className="mb-3 text-3xl">🎸</div>
            <h2 className="mb-2 text-base font-semibold text-red-800 dark:text-red-200">
              {this.props.componentName
                ? `${this.props.componentName} 组件出现问题`
                : '出现了一些问题'}
            </h2>
            <p className="mb-3 text-xs text-red-600 dark:text-red-400 line-clamp-3">
              {this.state.error?.message || '应用发生了意外错误'}
            </p>
            {this.state.errorInfo?.componentStack && (
              <details className="mb-3 text-left">
                <summary className="text-xs text-red-500 cursor-pointer">查看详情</summary>
                <pre className="mt-2 text-[10px] text-red-400 overflow-auto max-h-32 p-2 bg-red-100 dark:bg-red-900 rounded">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <div className="flex justify-center gap-2">
              <button
                onClick={this.handleReset}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                重试
              </button>
              <button
                onClick={this.handleReload}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
): React.FC<P> {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary componentName={componentName}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}