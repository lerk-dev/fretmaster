/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const isTauri = process.env.TAURI_BUILD === 'true' || process.env.TAURI === 'true'

// dev 模式下不使用 output: 'export'，因为静态导出模式不生成 Flight data，
// 导致客户端无法 hydrate（点击无反应）
const nextConfig = isDev
  ? {
      typescript: {
        ignoreBuildErrors: true,
      },
      images: {
        unoptimized: true,
      },
      compiler: {
        removeConsole: false,
      },
    }
  : {
      output: 'export',
      distDir: isTauri ? 'dist-tauri' : 'out',
      basePath: '',
      assetPrefix: './',
      trailingSlash: true,
      typescript: {
        ignoreBuildErrors: true,
      },
      images: {
        unoptimized: true,
      },
      compiler: {
        removeConsole: false,
      },
    }

export default nextConfig
