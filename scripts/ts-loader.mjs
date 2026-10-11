// Позволяет тестам импортировать .ts-файлы проекта без расширения: ./env -> ./env.ts
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.\w+$/.test(specifier)) {
    try { return await next(`${specifier}.ts`, context); } catch {}
  }
  return next(specifier, context);
}
