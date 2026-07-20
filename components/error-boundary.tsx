'use client'

import React from 'react'

interface FmErrorsWindow extends Window {
  __fmerrors?: string[]
}

type ErrorBoundaryLang = 'zh-CN' | 'en'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  componentName?: string
  language?: ErrorBoundaryLang
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

const ERROR_MESSAGES: Record<ErrorBoundaryLang, {
  title: string
  componentTitle: (name: string) => string
  default: string
  retry: string
  reload: string
  details: string
}> = {
  'zh-CN': {
    title: '出现了一些问题',
    componentTitle: (name) => `${name} 组件出现问题`,
    default: '应用发生了意外错误',
    retry: '重试',
    reload: '刷新页面',
    details: '查看详情',
  },
  'en': {
    title: 'Something went wrong',
    componentTitle: (name) => `${name} component encountered an issue`,
    default: 'An unexpected error occurred',
    retry: 'Retry',
    reload: 'Refresh Page',
    details: 'View details',
  },
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

    if (typeof window !== 'undefined' && (window as FmErrorsWindow).__fmerrors) {
      (window as FmErrorsWindow).__fmerrors!.push(
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

      const lang = this.props.language || 'zh-CN'
      const msg = ERROR_MESSAGES[lang]

      return (
        <div className="flex min-h-[200px] items-center justify-center p-4" role="alert">
          <div className="max-w-md w-full rounded-lg border border-red-200 bg-red-50 p-5 text-center dark:border-red-800 dark:bg-red-950">
            <div className="mb-3 text-3xl" aria-hidden="true">🎸</div>
            <h2 className="mb-2 text-base font-semibold text-red-800 dark:text-red-200">
              {this.props.componentName
                ? msg.componentTitle(this.props.componentName)
                : msg.title}
            </h2>
            <p className="mb-3 text-xs text-red-600 dark:text-red-400 line-clamp-3">
              {this.state.error?.message || msg.default}
            </p>
            {this.state.errorInfo?.componentStack && (
              <details className="mb-3 text-left">
                <summary className="text-xs text-red-500 cursor-pointer">{msg.details}</summary>
                <pre className="mt-2 text-[10px] text-red-400 overflow-auto max-h-32 p-2 bg-red-100 dark:bg-red-900 rounded">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <div className="flex justify-center gap-2">
              <button
                onClick={this.handleReset}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 min-h-[36px]"
              >
                {msg.retry}
              </button>
              <button
                onClick={this.handleReload}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-red-950 dark:text-red-300 min-h-[36px]"
              >
                {msg.reload}
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