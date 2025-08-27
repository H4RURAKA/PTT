// 상단 버튼/헤더 스페이서

/**
 * 헤더 버튼 클릭 핸들러 바인딩
 * - 버튼이 없거나 핸들러가 함수가 아니면 조용히 스킵
 * - addEventListener 사용으로 외부 스크립트와 충돌 최소화
 * - 반환값: 언바인드 함수(선택 사용)
 */
export function wireHeaderButtons({ onReset, onShare, onPrint, onTheme, onCvd, onScores, }) {
  const pairs = [
    ['resetBtn', onReset],
    ['shareBtn', onShare],
    ['printBtn', onPrint],
    ['themeBtn', onTheme],
    ['cvdBtn',   onCvd],
    ['scoresBtn', onScores],
  ];

  const disposers = [];

  for (const [id, handler] of pairs) {
    const el = document.getElementById(id);
    if (!el || typeof handler !== 'function') continue;

    const fn = (e) => {
      // 폼 내부 등에서 기본 동작 방지(버튼 기본 submit 등)
      e.preventDefault?.();
      handler(e);
    };
    el.addEventListener('click', fn);
    disposers.push(() => el.removeEventListener('click', fn));
  }

  // 필요 시 호출해서 모든 바인딩 해제 가능
  return () => disposers.forEach(unbind => unbind());
}

/**
 * 고정 헤더 높이만큼 스페이서 높이를 맞춤
 * - 헤더/스페이서가 없으면 조용히 종료
 * - 요청이 잦을 수 있어 rAF로 살짝 디바운스
 */
export function adjustHeaderSpacer() {
  const header = document.getElementById('appHeader');
  const spacer = document.getElementById('header-spacer');
  if (!header || !spacer) return;

  const apply = () => {
    const h = header.offsetHeight || 0;
    spacer.style.height = `${h}px`;
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(apply);
  } else {
    apply();
  }
}
