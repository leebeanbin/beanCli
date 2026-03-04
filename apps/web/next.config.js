const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@tfsdc/ui-web', '@tfsdc/kernel'],
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

module.exports = nextConfig;
