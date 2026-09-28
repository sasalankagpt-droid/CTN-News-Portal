(() => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('ctn-theme');
  if (savedTheme) root.dataset.theme = savedTheme;
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next; localStorage.setItem('ctn-theme', next);
  });
  let font = Number(localStorage.getItem('ctn-font') || 100);
  const applyFont = () => root.style.fontSize = `${font}%`;
  applyFont();
  document.getElementById('fontPlus')?.addEventListener('click',()=>{font=Math.min(125,font+5);localStorage.setItem('ctn-font',font);applyFont();});
  document.getElementById('fontMinus')?.addEventListener('click',()=>{font=Math.max(85,font-5);localStorage.setItem('ctn-font',font);applyFont();});

  function flashCopied(btn){ btn.classList.add('copied'); const old=btn.title; btn.title='සබැඳිය පිටපත් විය'; setTimeout(()=>{btn.classList.remove('copied');btn.title=old;},1400); }
  document.querySelectorAll('[data-share]').forEach(btn => btn.addEventListener('click', async () => {
    const type = btn.dataset.share;
    const url = location.href;
    const title = btn.closest('.share-row')?.dataset.shareTitle || document.title;
    if (type === 'facebook') return window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,'_blank','noopener,noreferrer,width=720,height=620');
    if (type === 'whatsapp') return window.open(`https://wa.me/?text=${encodeURIComponent(title+' '+url)}`,'_blank','noopener,noreferrer');
    if (type === 'x') return window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,'_blank','noopener,noreferrer,width=720,height=620');
    if (type === 'native' && navigator.share) { try { await navigator.share({title,text:title,url}); return; } catch(e){ if(e?.name==='AbortError') return; } }
    try { await navigator.clipboard.writeText(url); flashCopied(btn); } catch { prompt('මෙම සබැඳිය පිටපත් කරන්න:',url); }
  }));

  const saveBtn = document.getElementById('saveArticle');
  const savedBox = document.getElementById('savedStories');
  const saved = JSON.parse(localStorage.getItem('ctn-saved') || '[]');
  function renderSaved(){ if(!savedBox) return; savedBox.innerHTML = saved.length ? saved.map(x=>`<a class="related-link" href="/article/${x.slug}"><strong>${x.title}</strong></a>`).join('') : '<small>තවම සුරකින ලද පුවත් නොමැත.</small>'; }
  renderSaved();
  if(saveBtn){
    const slug=saveBtn.dataset.id;
    const title=document.querySelector('.article-main h1')?.textContent.trim()||slug;
    if(saved.some(x=>x.slug===slug)) saveBtn.textContent='♥ සුරකින ලදී';
    saveBtn.addEventListener('click',()=>{ const i=saved.findIndex(x=>x.slug===slug); if(i>=0){saved.splice(i,1);saveBtn.textContent='♡ පසුව කියවීමට සුරකින්න';}else{saved.unshift({slug,title});saveBtn.textContent='♥ සුරකින ලදී';}localStorage.setItem('ctn-saved',JSON.stringify(saved.slice(0,20)));renderSaved();});
  }

  document.getElementById('readAloud')?.addEventListener('click',()=>{
    if(!('speechSynthesis' in window)) return alert('මෙම browser එකේ text-to-speech පහසුකම නොමැත.');
    speechSynthesis.cancel();
    const text=(document.querySelector('.article-main h1')?.textContent||'')+' '+(document.getElementById('articleBody')?.innerText||'');
    const utter=new SpeechSynthesisUtterance(text); utter.lang='si-LK'; speechSynthesis.speak(utter);
  });

  // v1.3 performance cleanup: remove the old service worker/SSE behavior.
  // A permanent EventSource connection can stop browsers from using the back/forward cache,
  // and the old service worker could keep stale v1.2 CSS/JS on localhost.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister())).catch(()=>{});
  }
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ctn-shell-')).map(k => caches.delete(k)))).catch(()=>{});
  }
  window.addEventListener('pageshow', () => {
    document.documentElement.classList.remove('page-leaving');
  });
})();