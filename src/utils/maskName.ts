/** 손님 모드의 게임 플레이어 이름 가리기(요청: "첫글자와 마지막 글자빼고 동그라미로(반각) 너무 크지 않은 동그라미").
 *  가운데 글자를 하나씩 반각 작은 동그라미(◦ U+25E6)로 바꾼다 — ○(U+25CB)은 전각이라 크다. 두 글자는 가릴 가운데가 없으니
 *  **뒤 글자를 가린다**(요청: "그렇게 뒤를 가려줘" · 정구 → 정◦). 한 글자는 그대로다. 글자 수는 코드 포인트로 센다(이모지·서로게이트
 *  쌍이 반 토막 나지 않게). 표시에만 쓴다 — 리플레이 원 이름(rawName)은 재생기가 트랙과 맞추는 열쇠라 그대로 두고, 보이는 글자만 바꾼다. */
export const MASK_DOT = "\u25E6";

export function maskPlayerName(name: string): string {
  const cps = Array.from(name);
  if (cps.length <= 1) return name;
  if (cps.length === 2) return cps[0] + MASK_DOT;
  return cps[0] + MASK_DOT.repeat(cps.length - 2) + cps[cps.length - 1];
}
