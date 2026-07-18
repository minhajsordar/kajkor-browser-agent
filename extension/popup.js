// Browser Agent — popup. Intentionally minimal: the extension is the browser
// EXECUTOR; tasks, chat and data live in the desktop app (via the backend).
// The only user-facing control here is starting a teaching session.

const learnBtn = document.getElementById('learnBtn');
const hint = document.getElementById('hint');

function setHint(msg) {
  hint.textContent = msg || '';
  hint.classList.toggle('hidden', !msg);
}

learnBtn.addEventListener('click', async () => {
  setHint('');
  const res = await chrome.runtime.sendMessage({ type: 'START_LEARN' });
  if (!res?.ok) { setHint(res?.error || 'Could not start learning on this page.'); return; }
  window.close(); // the overlay lives in the tab
});
