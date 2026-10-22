/** onStar — 별 자리를 누를 때(로그인 화면의 숨은 가입 진입 · AuthScreen). 별 그림은 3D 로 돌아 누름 자리가 흔들리므로 별 자리에 투명 단추를 따로 얹는다. */
export default function BrandLogo({ light, onStar }: { light: boolean; onStar?: () => void }) {
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
      {onStar && <button type="button" className="scr-brand-logo-star-hit" onClick={onStar} tabIndex={-1} aria-hidden />}
    </span>
  );
}
