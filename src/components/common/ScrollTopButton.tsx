import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { addRafScrollListener, getScrollTop, smoothScrollRootToTop } from "../../utils/scrollRoot";

const SHOW_AFTER_PX = 400;

export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(getScrollTop() > SHOW_AFTER_PX);
    onScroll();
    return addRafScrollListener(onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="scr-scrolltop scr-circle-btn scr-lighting-color-glass"
      onClick={() => smoothScrollRootToTop()}
      aria-label="맨 위로"
    >
      <ArrowUp size={22} />
    </button>
  );
}
