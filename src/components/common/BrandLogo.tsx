export default function BrandLogo({ light }: { light: boolean }) {
  return (
    <span className="scr-brand-logo-wrap scr-logo-fadein">
      <img
        src={light ? "/images/logo/logo_no_symbol_black.png" : "/images/logo/logo_no_symbol_white.png"}
        alt="스타게이트" width={2544} height={327}
        className="scr-brand-logo-img"
      />
      <img
        src="/images/logo/symbol.png" alt="" aria-hidden width={457} height={430}
        className="scr-brand-logo-star"
      />
    </span>
  );
}
