import type { Metadata } from "next";
import LegalPage, { Op } from "@/components/LegalPage";
import DataRequestForm from "@/components/DataRequestForm";

export const metadata: Metadata = { title: "Запрос по данным" };

export default function DataRequest() {
  return (
    <LegalPage title="Запрос по данным">
      <p>Здесь можно удалить профиль чата, попросить скрыть или исправить сведения об объекте (если вы собственник или представитель), узнать, какие данные о вас хранятся, или отозвать согласие. Мы ответим в сроки, установленные законом.</p>
      <p className="note" style={{ marginLeft: 0 }}>Профиль чата вы можете удалить сами кнопкой «Удалить профиль» в чате. Письмом: <Op field="email" />.</p>
      <DataRequestForm />
    </LegalPage>
  );
}
