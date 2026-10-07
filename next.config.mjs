/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const repo = process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.replace(/.*?\//, '') : 'kids-study-hub';

const nextConfig = {
  output: 'export',
  basePath: isGithubActions ? `/${repo}` : '',
  images: {
    unoptimized: true
  },
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  }
};

export default nextConfig;
