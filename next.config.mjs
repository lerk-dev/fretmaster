/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用静态导出以获得与EdgeOne Pages相同的性能
  output: 'export',
  distDir: 'dist',
  basePath: '/fretmaster',
  assetPrefix: '/fretmaster',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 添加性能优化配置
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // 禁用服务器端功能以获得最佳性能
  experimental: {
    optimizeCss: true,
  },
}

export default nextConfig
