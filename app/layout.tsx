import type { Metadata } from 'next'
import { IBM_Plex_Sans_Thai, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from 'next-themes'
import { StagingIndicator } from '@/components/layout/staging-indicator'
import { assertDeploymentEnvironment } from '@/lib/deployment-environment.mjs'
import './globals.css'

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'thai'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const deployment = assertDeploymentEnvironment(process.env)
const isStaging = deployment.tier === 'staging'
const sourceRevision = /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '')
  ? process.env.VERCEL_GIT_COMMIT_SHA
  : undefined

export const metadata: Metadata = {
  title: 'KorKru — กอการเรียนรู้ โดยครู',
  description: 'เว็บไซต์โจทย์ฟิสิกส์สำหรับครูและนักเรียน สร้างโจทย์สุ่มเลขไม่ซ้ำกัน',
  robots: isStaging ? { index: false, follow: false, nocache: true } : undefined,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      // Style preset — see [data-style] at the bottom of app/globals.css.
      data-style="playful"
      data-deployment-environment={deployment.tier}
      data-source-revision={isStaging ? sourceRevision : undefined}
      className={`${ibmPlexSansThai.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          {isStaging ? <StagingIndicator /> : null}
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
