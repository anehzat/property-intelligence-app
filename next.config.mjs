/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: AWS Amplify serves the `out/` folder as plain files.
  output: 'export',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
