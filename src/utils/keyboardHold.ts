/* ★ 자판 붙들기(2026-10-26, 요청: "글쓰기 누르면 자동으로 제목에 커서 포커스") — iOS 사파리는 **누름 안에서** 부른 focus() 에만 자판을 띄운다.
   글쓰기는 누른 뒤 화면을 바꿔 제목 칸을 새로 그리므로, 그 칸의 autoFocus 는 누름 밖이라 커서만 깜빡이고 자판이 안 뜬다(데스크톱·헤드리스는 멀쩡).
   누르는 순간 화면 밖 임시 칸에 먼저 포커스를 두면 자판이 뜨고, 제목 칸이 포커스를 넘겨받아도 자판이 그대로 남는다.
   넘겨받으면(releaseKeyboardHold) 또는 잠시 뒤 임시 칸은 걷는다. */
let held: HTMLInputElement | null = null;

export function holdKeyboard(): void {
  releaseKeyboardHold();
  const el = document.createElement("input");
  el.type = "text";
  el.setAttribute("aria-hidden", "true");
  el.tabIndex = -1;
  /* 화면 위쪽 안(뷰포트 밖이면 사파리가 그 자리로 끌어올린다) · 투명 · 16px(그보다 작으면 사파리가 확대한다). */
  el.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none;";
  document.body.appendChild(el);
  el.focus({ preventScroll: true });
  held = el;
  setTimeout(() => { if (held === el) releaseKeyboardHold(); }, 1500);
}

export function releaseKeyboardHold(): void {
  held?.remove();
  held = null;
}
