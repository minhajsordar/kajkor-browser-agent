/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '**',
      },
    ],
  },
  compiler: {
    // Warning: Prop `className` did not match. when using styled components with semantic-ui-react
    // Enables the styled-components SWC transform
    styledComponents: true
  }
};

export default nextConfig;
