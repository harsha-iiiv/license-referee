import type {Metadata} from 'next'
import {Geist, Geist_Mono} from 'next/font/google'
import './globals.css'

const geistSans = Geist({variable: '--font-geist-sans', subsets: ['latin']})
const geistMono = Geist_Mono({variable: '--font-geist-mono', subsets: ['latin']})

export const metadata: Metadata = {
  title: 'License Referee',
  description:
    'Paste a package.json. Get a ruling per dependency, with the FSF, OSI, Apache, Mozilla and Eclipse sources that back it, from a Sanity Knowledge Base.',
}

export default function RootLayout({children}: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--fg)]">{children}</body>
    </html>
  )
}
