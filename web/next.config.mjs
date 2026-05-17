/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // For Docker optimization
  experimental: {
    outputFileTracingRoot: undefined,
  },
};
export default nextConfig;
