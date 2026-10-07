import { computePosition, autoUpdate, flip, shift, size, offset, type Placement } from "@floating-ui/dom";

interface PopoverOpts {
  matchAnchor?: boolean;
  growFromAnchor?: boolean;
  growToContent?: boolean;
  maxWidth?: number;
  placement?: Placement;
}

const MARGIN = 8;

export function attachPopover(
  anchorEl: HTMLElement,
  floatingEl: HTMLElement,
  opts: PopoverOpts,
): () => void {
  const boundaryEl = (anchorEl.closest(".scr-modal-body") ?? anchorEl.closest(".scr-modal")) as HTMLElement | null;
  const boundary = boundaryEl ?? "clippingAncestors";

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
