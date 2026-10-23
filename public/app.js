const $ = id => document.getElementById(id);
let locale = 'fa', config, history = [], controller, busy = false;
function translate() {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-en]')) el.textContent = el.dataset[locale];
  $('language').textContent = locale === 'en' ? 'فارسی' : 'English';
  $('prompt').placeholder = locale === 'en' ? 'Ask a question or try an idea…' : 'یک سؤال یا ایده بنویسید…';
  $('hint').textContent = locale === 'en' ? 'Offline preview uses no credits. Real API requests use your Sarovi balance.' : 'پیش‌نمایش آفلاین رایگان است. درخواست واقعی از اعتبار حساب ساروی مصرف می‌کند.';
  if (config) $('mode').textContent = config.demo ? (locale === 'en' ? 'Offline preview · no API calls' : 'پیش‌نمایش آفلاین · بدون درخواست API') : config.model;
}
function message(role, text) {
  const row = document.createElement('div'); row.className = 'message ' + role;
  const label = document.createElement('span'); label.className = 'who'; label.textContent = role === 'user' ? (locale === 'en' ? 'YOU' : 'شما') : 'ساروی';
  const body = document.createElement('div'); body.dir = 'auto'; body.textContent = text;
  row.append(label, body); $('messages').append(row); return {row, body};
}
function scrollEnd() { document.querySelector('.conversation').scrollTop = document.querySelector('.conversation').scrollHeight; }
function setBusy(value) {
  busy = value; $('send').hidden = value; $('stop').hidden = !value; $('prompt').disabled = value; $('new-chat').disabled = value; $('language').disabled = value;
}
async function* events(body) {
  const reader = body.getReader(), decoder = new TextDecoder(); let buffer = '';
  try {
    while (true) {
      const {value, done} = await reader.read(); buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
      let index;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const packet = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        for (const line of packet.split('\n')) if (line.startsWith('data: ')) yield JSON.parse(line.slice(6));
      }
      if (done) return;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
$('language').onclick = () => { locale = locale === 'en' ? 'fa' : 'en'; translate(); };
$('new-chat').onclick = () => { history = []; $('messages').replaceChildren(); $('welcome').hidden = false; $('notice').textContent = ''; $('usage').textContent = ''; $('prompt').focus(); };
for (const button of document.querySelectorAll('[data-prompt-en]')) button.onclick = () => {
  $('prompt').value = locale === 'en' ? button.dataset.promptEn : button.dataset.promptFa; $('prompt').focus();
};
$('stop').onclick = () => controller?.abort();
$('prompt').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } };
$('composer').onsubmit = async event => {
  event.preventDefault();
  const text = $('prompt').value.trim();
  if (!text || busy || !config) return;
  if (history.length >= 10) { $('notice').textContent = locale === 'en' ? 'Start a new chat to keep the context small.' : 'برای کوتاه ماندن زمینه، گفتگوی تازه‌ای شروع کنید.'; return; }
  setBusy(true); $('welcome').hidden = true; $('notice').textContent = ''; $('usage').textContent = '';
  message('user', text); $('prompt').value = '';
  const reply = message('assistant', ''), next = [...history, {role: 'user', content: text}];
  controller = new AbortController();
  let completed = false, key, requestId;
  try {
    const response = await fetch('/api/chat', {method: 'POST', signal: controller.signal,
      headers: {'Content-Type': 'application/json', ...($('password').value ? {'X-App-Password': $('password').value} : {})},
      body: JSON.stringify({messages: next})});
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || (locale === 'fa' ? 'درخواست انجام نشد.' : 'Request failed.')); }
    for await (const item of events(response.body)) {
      if (item.type === 'start') key = item.idempotency_key;
      if (item.type === 'receipt') requestId = item.request_id;
      if (item.type === 'delta') { reply.body.textContent += item.text; scrollEnd(); }
      if (item.type === 'error') { requestId = item.request_id || requestId; throw new Error(item.message); }
      if (item.type === 'done') { completed = true; $('usage').textContent = item.demo ? (locale === 'fa' ? 'نمایشی' : 'DEMO') : (item.usage?.total_tokens ?? '—') + (locale === 'fa' ? ' توکن' : ' tokens'); }
    }
    if (!completed) throw new Error(locale === 'en' ? 'The response ended early.' : 'پاسخ پیش از پایان قطع شد.');
    history = [...next, {role: 'assistant', content: reply.body.textContent}];
  } catch (error) {
    reply.row.classList.add('error');
    $('notice').textContent = (error.name === 'AbortError' ? (locale === 'en' ? 'Stopped. No automatic retry was made.' : 'متوقف شد. درخواست خودکار تکرار نشده است.') : error.message) +
      (requestId ? ' · درخواست: ' + requestId : '') + (key ? ' · کلید پیگیری: ' + key : '');
    if (!reply.body.textContent) reply.body.textContent = locale === 'en' ? 'No complete response.' : 'پاسخ کامل دریافت نشد.';
  } finally { setBusy(false); $('prompt').focus(); scrollEnd(); }
};
fetch('/api/config').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
  config = data; $('password-wrap').hidden = !data.requiresPassword; translate();
}).catch(() => { $('mode').textContent = 'برنامه در دسترس نیست'; $('notice').textContent = 'تنظیمات برنامهٔ محلی بارگذاری نشد.'; });

translate();
