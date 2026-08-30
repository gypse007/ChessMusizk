import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CHESS → MUSIC',
    template: '%s | CHESS → MUSIC',
  },
  description: 'Transform your chess games into original soundtracks. Upload PGN, analyze with Stockfish, and generate music mapped to your game.',
  keywords: ['chess', 'music', 'pgn', 'stockfish', 'soundtrack', 'generative'],
  authors: [{ name: 'Chess to Music' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://chesstomusic.com',
    title: 'CHESS → MUSIC',
    description: 'Your game. Your soundtrack.',
    siteName: 'CHESS → MUSIC',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CHESS → MUSIC',
    description: 'Your game. Your soundtrack.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased min-h-screen bg-slate-950 text-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
