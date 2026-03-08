import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MotionCraft — Редактор изображений и видео',
  description: 'Профессиональный редактор изображений и видео с анимацией. Работает локально в браузере.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MotionCraft',
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a1f',
  userScalable: false,
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
