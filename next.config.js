/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "localhost:3002", "127.0.0.1:3002"]
    }
  }
};

module.exports = nextConfig;
