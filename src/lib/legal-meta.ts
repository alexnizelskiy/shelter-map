// Версия юридических документов: при изменении текста поднимайте дату, согласия считаются по ней
export const LEGAL_VERSION = "2026-10-12";
export const LEGAL_DATE_RU = "12.10.2026";

export const REQUEST_KINDS = ["delete_profile", "hide_object", "access", "withdraw", "other"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_LABEL: Record<RequestKind, string> = {
  delete_profile: "Удалить мой профиль и сообщения в чате",
  hide_object: "Скрыть или исправить сведения об объекте (я собственник или представитель)",
  access: "Узнать, какие данные обо мне хранятся",
  withdraw: "Отозвать согласие на обработку данных",
  other: "Другой вопрос",
};
