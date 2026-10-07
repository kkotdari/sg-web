import { useEffect, useState } from "react";
import { ModelCatalog, type ModelCatalogGroup } from "scplay";
import { navigateTo, parseRoute } from "../../utils/route";

const SLUG: Record<ModelCatalogGroup, string> = { 유닛: "unit", 건물: "bld", 부가: "aux" };

function groupFromUrl(): ModelCatalogGroup {
  const item = parseRoute().item;
  const hit = (Object.keys(SLUG) as ModelCatalogGroup[]).find((g) => SLUG[g] === item);
  return hit ?? "유닛";
}

export default function CatalogScreen() {
  const [group, setGroup] = useState<ModelCatalogGroup>(groupFromUrl);

  useEffect(() => {
    const onPop = (): void => {
      if (parseRoute().screen === "catalog") setGroup(groupFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const pick = (g: ModelCatalogGroup): void => {
    setGroup(g);
    navigateTo(`/catalog/${SLUG[g]}`, { replace: true, search: window.location.search, notify: false });
  };

  return (
    <div className="scr-screen">
      <div className="scr-v2-toolbar">
        <div className="scr-v2-toolbar-title-row">
          <h1 className="scr-title scr-v2-toolbar-title">도록</h1>
        </div>
      </div>
      <ModelCatalog group={group} onGroup={pick} />
    </div>
  );
}
