/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const isTauri = process.env.TAURI_BUILD === 'true'

const nextConfig = {
  output: isDev ? undefined : 'export',
  distDir: isTauri ? 'out' : 'dist',
  basePath: isDev || isTauri ? '' : '/fretmaster',
  assetPrefix: isDev || isTauri ? '' : '/fretmaster',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizeCss: true,
  },
}

export default nextConfig
