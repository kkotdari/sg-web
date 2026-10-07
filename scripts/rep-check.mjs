import screp from "screp-js";
import fs from "node:fs";

const files = process.argv.slice(2);
for (const f of files) {
  const buf = new Uint8Array(fs.readFileSync(f));
  try {
    const r = await screp.parseBuffer(buf, {
      header: true, computed: true, mapData: true, mapTiles: true, mapResLoc: true, cmds: true,
    });
    const h = r.Header ?? {};
    const c = r.Computed ?? {};
    const md = r.MapData ?? {};
    console.log("\n===", f.split("/").pop());
    console.log("  엔진/버전:", h.Engine?.Name, "| Version", h.Version, "| Frames", h.Frames);
    console.log("  시작시각:", h.StartTime, "| 맵:", JSON.stringify(h.Map), "| 크기:", h.MapWidth + "x" + h.MapHeight);
    console.log("  players:", (h.Players ?? []).map((p) => `${p.Name}[${p.Race?.Name}/${p.Type?.Name}/team${p.Team}]`).join(", "));
    console.log("  APM/EAPM:", JSON.stringify(c.PlayerDescs?.map((d) => [d.PlayerID, d.APM, d.EAPM])));
    console.log("  승자추정:", c.WinnerTeam, "| 커맨드수:", r.Commands?.Cmds?.length ?? 0);
    console.log("  맵타일:", md.Tiles ? `있음(${md.Tiles.length})` : "없음",
      "| 자원:", md.MineralFields ? `미네랄 ${md.MineralFields.length}` : "없음",
      md.Geysers ? `가스 ${md.Geysers.length}` : "",
      "| 시작지점:", JSON.stringify((md.StartLocations ?? []).map((s) => [s.X, s.Y])));
  } catch (e) {
    console.log("\n===", f.split("/").pop(), "→ 파싱 실패:", String(e));
  }
}
