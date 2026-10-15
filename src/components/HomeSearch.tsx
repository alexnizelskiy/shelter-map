"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Map as MapIcon } from "lucide-react";
import { readPref } from "@/lib/use-pref";
import CitySearch, { CHOICE_KEY } from "./CitySearch";
import LocationPrompt from "./LocationPrompt";
import Spinner from "./Spinner";

export default function HomeSearch() {
  const router = useRouter();
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);

  // «Открыть карту»: сохранённый город, иначе город по сети (без запроса разрешений), иначе Ростов-на-Дону
  const openMap = async () => {
    setBusy(true);
    let slug = readPref(CHOICE_KEY, "");
    if (!slug) {
      try {
        const j = await (await fetch("/api/locate")).json();
        if (j.found && j.place?.slug) slug = j.place.slug;
      } catch { /* нет сети или определения: откроем город по умолчанию */ }
    }
    router.push(`/${slug || "rostov-na-donu"}`);
  };

  return (
    <>
      <LocationPrompt onChooseOther={() => setFocus((n) => n + 1)} />
      <button className="primary open-map" onClick={openMap} disabled={busy}>
        {busy ? <Spinner size={18} /> : <MapIcon size={18} />}Открыть карту
      </button>
      <p className="note open-map-note">Город определим автоматически. Или найдите свой ниже.</p>
      <div className="card home-search glass" key={focus}>
        <CitySearch current="" onClose={() => {}} hideClose />
      </div>
    </>
  );
}
