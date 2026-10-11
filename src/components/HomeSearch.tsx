"use client";

import { useState } from "react";
import CitySearch from "./CitySearch";
import LocationPrompt from "./LocationPrompt";

export default function HomeSearch() {
  const [focus, setFocus] = useState(0);
  return (
    <>
      <LocationPrompt onChooseOther={() => setFocus((n) => n + 1)} />
      <div className="card home-search glass" key={focus}>
        <CitySearch current="" onClose={() => {}} hideClose />
      </div>
    </>
  );
}
