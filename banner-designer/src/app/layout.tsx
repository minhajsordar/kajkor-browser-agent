import type { Metadata } from "next";
import React from 'react'
import { Inter } from "next/font/google";
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/fonts.css';
import "./globals.css";


const inter = Inter({ subsets: ["latin"] });
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Head from "next/head";

export const metadata: Metadata = {
  title: "Banner Designer | AI banner design agent",
  description: "AI-assisted banner designer — the kajkor agent generates designs; designers refine them on a Canva-like canvas.",
  icons: {
    icon: [
      { rel: 'apple-touch-icon', sizes: '180x180', url: '/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', url: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', url: '/favicon-16x16.png' },
    ],
    other: [
      { rel: 'manifest', url: '/site.webmanifest' },
      { rel: 'mask-icon', url: '/safari-pinned-tab.svg', color: '#5bbad5' },
    ],
  }
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* <Head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />
        <meta name="msapplication-TileColor" content="#da532c" />
        <meta name="theme-color" content="#ffffff" />
      </Head> */}
      <body className={inter.className}>
        {/* React.Suspense used to remove client side exception error */}
        <React.Suspense>
          {children}
          <ToastContainer />
        </React.Suspense>
      </body>
    </html>
  );
}
