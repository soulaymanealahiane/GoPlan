const dialog = document.getElementById('problem-dialog');
const form = document.getElementById('demo-problem-form');
const field = document.getElementById('problem-message');
const error = document.getElementById('problem-error');
const receipt = document.getElementById('problem-receipt');
const closeButton = document.getElementById('close-problem');
const sendButton = form.querySelector('[type="submit"]');
let submission;

for (const button of document.querySelectorAll('[data-report-problem]')) {
  button.addEventListener('click', () => dialog.showModal());
}
closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (!receipt.hidden) {
    receipt.hidden = true;
    form.hidden = false;
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sendButton.disabled) return;
  const message = field.value.trim();
  error.hidden = true;
  if (!message) {
    error.textContent = 'Describe what happened before sending.';
    error.hidden = false;
    field.focus();
    return;
  }
  if (submission?.message !== message) submission = {requestId: crypto.randomUUID(), message};
  sendButton.disabled = true;
  field.readOnly = true;
  sendButton.textContent = 'Sending…';
  try {
    const response = await fetch('/api/demo/problems', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok || result.received !== true) {
      throw Error(result.error || 'Could not confirm delivery. Please try again.');
    }
    form.reset();
    submission = undefined;
    form.hidden = true;
    receipt.hidden = false;
    if (dialog.open) closeButton.focus();
  } catch (cause) {
    error.textContent = cause.name === 'Error' ? cause.message : 'Could not confirm delivery. Your message is here to retry.';
    error.hidden = false;
  } finally {
    sendButton.disabled = false;
    field.readOnly = false;
    sendButton.textContent = 'Send report';
  }
});
