import Image from "next/image";

// Логотип «Опора» — один зелёный вариант для всех тем
export default function BrandLogo({ height = 40 }: { height?: number }) {
  const width = Math.round((height * 244) / 66);
  return <Image className="logo" src="/logo/opora.svg" alt="Опора — карта укрытий" width={width} height={height} unoptimized priority />;
}
