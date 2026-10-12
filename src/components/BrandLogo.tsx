import Image from "next/image";

// Логотип «Опора»: две версии (для светлой и тёмной темы), нужная показывается по теме через CSS
export default function BrandLogo({ height = 40 }: { height?: number }) {
  const width = Math.round((height * 244) / 66);
  return (
    <>
      <Image className="logo logo-light" src="/logo/opora-light.svg" alt="Опора — карта укрытий" width={width} height={height} unoptimized priority />
      <Image className="logo logo-dark" src="/logo/opora-dark.svg" alt="" aria-hidden="true" width={width} height={height} unoptimized priority />
    </>
  );
}
