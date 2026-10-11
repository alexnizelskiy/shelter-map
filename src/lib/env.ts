// Значения из панелей хостинга часто копируют вместе с кавычками, пробелами и даже «NAME=».
export function cleanEnv(value: string | undefined, name?: string, noSpaces = false): string {
  let s = (value ?? "").trim();
  if (name && s.toUpperCase().startsWith(`${name}=`)) s = s.slice(name.length + 1).trim();
  s = s.replace(/^["'`“”«]+|["'`“”»]+$/g, "").trim();
  return noSpaces ? s.replace(/\s+/g, "") : s;
}
