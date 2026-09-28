(() => {
  const editor = document.getElementById('richEditor');
  const body = document.getElementById('bodyField');
  const form = document.querySelector('.editor-form');
  document.querySelectorAll('[data-cmd]').forEach(btn => btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    const val = btn.dataset.value || null;
    document.execCommand(cmd, false, val);
    editor.focus();
  }));
  document.getElementById('addLink')?.addEventListener('click', () => {
    const url = prompt('Paste the link URL');
    if (url) document.execCommand('createLink', false, url);
  });
  form?.addEventListener('submit', () => body.value = editor.innerHTML);
  const title = document.getElementById('title');
  const slug = document.getElementById('slug');
  title?.addEventListener('blur', () => {
    if (!slug.value.trim()) slug.value = title.value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-');
  });
})();
