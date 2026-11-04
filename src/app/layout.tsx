import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arlo",
  description: "Arlo — self-hosted AI sales CRM and cold-outreach assistant.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint so there's no flash of the wrong
            theme. "system" (no saved value) falls through to the CSS media query. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('arlo-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
