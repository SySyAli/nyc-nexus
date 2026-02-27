import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NYC Nexus — Real-Time Semantic Knowledge Graph',
  description:
    'An interactive knowledge graph connecting Manhattan hotels, subway stations, and attractions via semantic proximity rules. Built for Oracle Hospitality.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
