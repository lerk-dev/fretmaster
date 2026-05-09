/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const isTauri = process.env.TAURI_BUILD === 'true' || process.env.TAURI === 'true'

const nextConfig = {
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
