import { computePosition, autoUpdate, flip, shift, size, offset, type Placement } from "@floating-ui/dom";

interface PopoverOpts {
  matchAnchor?: boolean;
  growFromAnchor?: boolean;
  growToContent?: boolean;
  maxWidth?: number;
  placement?: Placement;
  /** 플로팅 UI 의 잘림 셈(flip·shift·size) 대신 **창 기준 단순 자리**(2026-10-26, 지적: 아이폰 홈 화면 앱에서 통계 달 고르기 창이 단추 위로 뒤집혀
   *  화면 맨 위에 붙던 것 — 크로뮴에선 안 난다) — 단추 바로 아래 · 좌우는 창 안으로 죄고 · 아래가 모자랄 때만 위로. 창 크기는 innerWidth/innerHeight. */
  simple?: boolean;
}

const MARGIN = 8;

export function attachPopover(
  anchorEl: HTMLElement,
  floatingEl: HTMLElement,
  opts: PopoverOpts,
): () => void {
  const boundaryEl = (anchorEl.closest(".scr-modal-body") ?? anchorEl.closest(".scr-modal")) as HTMLElement | null;
  const boundary = boundaryEl ?? "clippingAncestors";

  if (opts.simple) {
    const place = (): void => {
      const r = anchorEl.getBoundingClientRect();
      const w = Math.min(opts.maxWidth ?? 280, window.innerWidth - MARGIN * 2);
      floatingEl.style.position = "fixed";
      floatingEl.style.width = `${w}px`;
      const h = floatingEl.offsetHeight;
      const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - MARGIN - w));
      const below = r.bottom + 4;
      const top = below + h <= window.innerHeight - MARGIN || r.top - 4 - h < MARGIN ? below : r.top - 4 - h;
      floatingEl.style.left = `${left}px`;
      floatingEl.style.top = `${top}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }

  const update = () => {
    computePosition(anchorEl, floatingEl, {
      strategy: "fixed",
      placement: opts.placement ?? "bottom-start",
      middleware: [
        offset(4),
        flip({ boundary, padding: MARGIN }),
        shift({ boundary, padding: MARGIN }),
        size({
          boundary,
          padding: MARGIN,
          apply({ availableHeight, availableWidth, rects }) {
            floatingEl.style.maxHeight = `${Math.max(80, availableHeight)}px`;

            if (opts.matchAnchor) {
              floatingEl.style.width = `${rects.reference.width}px`;
              return;
            }
            const capped = Math.min(opts.maxWidth ?? 280, availableWidth);
            if (opts.growToContent) {
              floatingEl.style.width = "max-content";
              floatingEl.style.minWidth = `${rects.reference.width}px`;
              floatingEl.style.maxWidth = `${capped}px`;
              return;
            }
            floatingEl.style.width = opts.growFromAnchor
              ? `${Math.max(rects.reference.width, capped)}px`
              : `${capped}px`;
          },
        }),
      ],
    }).then(({ x, y }) => {
      floatingEl.style.position = "fixed";
      floatingEl.style.left = `${x}px`;
      floatingEl.style.top = `${y}px`;
    });
  };

  return autoUpdate(anchorEl, floatingEl, update);
}
