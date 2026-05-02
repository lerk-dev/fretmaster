/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const isTauri = process.env.TAURI_BUILD === 'true' || process.env.TAURI === 'true'

const nextConfig = {
  output: isDev ? undefined : 'export',
  distDir: 'dist-tauri',
  basePath: '',
  assetPrefix: '.',
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
  experimental: {
    optimizeCss: true,
  },
}

export default nextConfig
