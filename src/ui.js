// 상단 버튼/헤더 스페이서

export function wireHeaderButtons({ onReset, onShare, onPrint, onTheme, onCvd }) {
  document.getElementById('resetBtn').onclick = onReset;
  document.getElementById('shareBtn').onclick = onShare;
  document.getElementById('printBtn').onclick = onPrint;
  document.getElementById('themeBtn').onclick = onTheme;
  document.getElementById('cvdBtn').onclick = onCvd;
}

export function adjustHeaderSpacer() {
  const header = document.getElementById('appHeader');
  const spacer = document.getElementById('header-spacer');
  if (!header || !spacer) return;
  spacer.style.height = `${header.offsetHeight}px`;
}
