import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Опора — карта укрытий",
    short_name: "Опора",
    description: "Ближайшее укрытие, маршрут и чат жителей. Режим «Тревога» работает без сети.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ru",
    background_color: "#e9ecef",
    theme_color: "#16a34a",
    categories: ["utilities", "navigation"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Режим «Тревога»", short_name: "Тревога", description: "Ближайшее укрытие одним экраном", url: "/alarm", icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }] }],
  };
}
