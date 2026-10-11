// Что взять с собой в укрытие. Составлено по общим рекомендациям МЧС России («тревожный чемоданчик»):
// документы и деньги, вода и еда, лекарства, связь и свет, одежда, всё для детей, пожилых и питомцев.
export type CheckItem = { id: string; text: string; key?: boolean; short?: string };
export type CheckGroup = { id: string; title: string; icon: "docs" | "health" | "water" | "phone" | "clothes" | "family"; items: CheckItem[] };

export const CHECKLIST: CheckGroup[] = [
  {
    id: "docs", title: "Документы и деньги", icon: "docs",
    items: [
      { id: "passport", text: "Паспорт", key: true, short: "паспорт" },
      { id: "kids-docs", text: "Свидетельства о рождении детей" },
      { id: "snils", text: "СНИЛС и полис ОМС" },
      { id: "copies", text: "Копии документов на жильё и автомобиль" },
      { id: "cash", text: "Наличные и банковская карта", key: true, short: "наличные и карта" },
      { id: "pack", text: "Всё это — в непромокаемом пакете" },
    ],
  },
  {
    id: "health", title: "Здоровье", icon: "health",
    items: [
      { id: "meds", text: "Лекарства, которые вы принимаете постоянно", key: true, short: "лекарства" },
      { id: "firstaid", text: "Аптечка: бинты, жгут, антисептик, пластыри" },
      { id: "pain", text: "Обезболивающее и средства от расстройства желудка" },
      { id: "masks", text: "Маски, перчатки, влажные салфетки" },
      { id: "glasses", text: "Очки, слуховой аппарат, ингалятор — если нужны" },
    ],
  },
  {
    id: "water", title: "Вода и еда", icon: "water",
    items: [
      { id: "water", text: "Питьевая вода (хотя бы пара бутылок на человека)", key: true, short: "вода" },
      { id: "food", text: "Не портящаяся еда: консервы, сухари, батончики, орехи" },
      { id: "cutlery", text: "Одноразовая посуда и нож" },
    ],
  },
  {
    id: "phone", title: "Связь и свет", icon: "phone",
    items: [
      { id: "phone", text: "Телефон, зарядка и павербанк", key: true, short: "телефон и павербанк" },
      { id: "torch", text: "Фонарик и запасные батарейки" },
      { id: "radio", text: "Радиоприёмник на батарейках" },
      { id: "contacts", text: "Номера родных, записанные на бумаге" },
    ],
  },
  {
    id: "clothes", title: "Одежда и гигиена", icon: "clothes",
    items: [
      { id: "warm", text: "Тёплая одежда или плед по сезону" },
      { id: "shoes", text: "Удобная закрытая обувь" },
      { id: "linen", text: "Сменное бельё и носки" },
      { id: "hygiene", text: "Средства гигиены, пакеты для мусора" },
    ],
  },
  {
    id: "family", title: "Дети, пожилые, питомцы", icon: "family",
    items: [
      { id: "kids", text: "Для ребёнка: питание, подгузники, игрушка или книга" },
      { id: "elder", text: "Для пожилых: лекарства и документы" },
      { id: "pet", text: "Для питомца: переноска или поводок, корм, ветпаспорт" },
    ],
  },
];

export const KEY_ITEMS = CHECKLIST.flatMap((g) => g.items.filter((i) => i.key));
export const TOTAL_ITEMS = CHECKLIST.reduce((n, g) => n + g.items.length, 0);
