type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const isDevelopment = process.env.NODE_ENV === 'development'

class Logger {
  private log(level: LogLevel, ...args: unknown[]): void {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`
    
    switch (level) {
      case 'debug':
        if (isDevelopment) {
          console.log(prefix, ...args)
        }
        break
      case 'info':
        console.info(prefix, ...args)
        break
      case 'warn':
        console.warn(prefix, ...args)
        break
      case 'error':
        console.error(prefix, ...args)
        break
    }
  }

  debug(...args: unknown[]): void {
    this.log('debug', ...args)
  }

  info(...args: unknown[]): void {
    this.log('info', ...args)
  }

  warn(...args: unknown[]): void {
    this.log('warn', ...args)
  }

  error(...args: unknown[]): void {
    this.log('error', ...args)
  }

  group(label: string): void {
    if (isDevelopment) {
      console.group(label)
    }
  }

  groupEnd(): void {
    if (isDevelopment) {
      console.groupEnd()
    }
  }

  time(label: string): void {
    if (isDevelopment) {
      console.time(label)
    }
  }

  timeEnd(label: string): void {
    if (isDevelopment) {
      console.timeEnd(label)
    }
  }
}

export const logger = new Logger()
