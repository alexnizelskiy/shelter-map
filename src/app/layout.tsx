import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: { default: "Опора — карта укрытий", template: "%s | Опора" },
  description: "Укрытия и убежища по городам России: источник и дата проверки у каждой точки.",
  applicationName: "Опора",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/pwa-icon/48", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/pwa-icon/48",
  },
  appleWebApp: { capable: true, title: "Опора", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: "#16a34a",
};

// Тема выставляется до первой отрисовки, чтобы не было вспышки: system | light | dark (хранится в localStorage).
const themeScript = `(function(){try{var p=localStorage.getItem('theme-pref')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.pref=p;var f=localStorage.getItem('ui-font');if(f==='1.15'||f==='1.3'||f==='1.5')r.dataset.font=f;if(localStorage.getItem('ui-contrast')==='high')r.dataset.contrast='high';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
