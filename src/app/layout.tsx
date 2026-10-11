import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Карта укрытий",
  description: "Укрытия и убежища по городам России: источник и дата проверки у каждой точки.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

// Тема выставляется до первой отрисовки, чтобы не было вспышки: system | light | dark (хранится в localStorage).
const themeScript = `(function(){try{var p=localStorage.getItem('theme-pref')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.pref=p;var f=localStorage.getItem('ui-font');if(f==='1.15'||f==='1.3'||f==='1.5')r.dataset.font=f;if(localStorage.getItem('ui-contrast')==='high')r.dataset.contrast='high';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
