import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'NOVA STATION — Explore. Trade. Build. Own.',
  description:
    'A browser-based 3D Web3 space station metaverse. Walk the decks of Nova Station, mine the belt, run contracts, craft, trade, and own what you earn.',
  keywords: ['web3 game', 'metaverse', 'three.js', 'space station', 'nft game', 'sepolia'],
  openGraph: {
    title: 'NOVA STATION',
    description: 'Explore a persistent 3D space station. Mine, trade, and own your assets on chain.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#05070d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
