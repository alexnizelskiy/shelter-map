import { Loader2 } from "lucide-react";

// Вращающийся индикатор из библиотеки иконок; наследует цвет текста
export default function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return <Loader2 size={size} className="spinner" role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
