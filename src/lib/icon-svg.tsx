import { createElement } from "react";

type IconData = { size?: number; node: [string, Record<string, string | number>][] };

// Рисует иконку из данных библиотеки lucide как обычный <svg>: подходит для генерации картинок на сервере (ImageResponse),
// где клиентские компоненты lucide-react использовать нельзя.
export function IconSvg({ data, size, color = "#fff", stroke = 2 }: { data: IconData; size: number; color?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {data.node.map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i }))}
    </svg>
  );
}
