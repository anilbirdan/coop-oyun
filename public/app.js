let token = location.hash.slice(1) || sessionStorage.getItem('coop-token');
if (token) sessionStorage.setItem('coop-token', token);
history.replaceState(null, '', location.pathname);
let state;
let selected;
let page = 'library';
let onboardingId, requesting = false, launchRequested = false;
const $ = selector => document.querySelector(selector);
function text(tag, value, className) { const element = document.createElement(tag); element.textContent = value; if (className) element.className = className; return element; }
async function api(route, input) {
  const response = await fetch('/api/' + route, { headers: { Authorization: 'Bearer ' + token, ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { method: 'POST', body: JSON.stringify(input) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'İşlem tamamlanamadı.');
  return result;
}
function notify(message) { $('#notice').textContent = message; $('#notice').classList.add('visible'); }
function navigate(name) {
  page = name;
  if (name === 'logs') loadSupport();
  document.querySelectorAll('.page').forEach(element => { element.hidden = element.id !== name; });
  document.querySelectorAll('.nav').forEach(element => element.classList.toggle('active', element.dataset.page === name));
  $('#breadcrumb').textContent = { library: 'Başlangıç / Steam kurulumu', settings: 'Kurulum / Oyun motoru', logs: 'Kayıtlar / Bu bilgisayar' }[name];
}
document.querySelectorAll('.nav').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
$('.brand').addEventListener('click', event => { event.preventDefault(); navigate('library'); });

function renderCards() {
  const container = $('#games'); container.replaceChildren();
  for (const game of state.games) {
    const article = text('article', '', 'game-card');
    const cover = text('div', '', 'cover ' + game.theme);
    cover.append(text('span', 'ARKADAŞLARLA HAYATTA KAL', 'cover-label'), text('span', game.mark, 'cover-mark'), text('span', game.name, 'cover-title'));
    const body = text('div', '', 'card-body');
    const top = text('div', '', 'card-top'); top.append(text('h3', game.name), text('span', 'Mac testi bekliyor', 'badge'));
    const bottom = text('div', '', 'card-bottom'); bottom.append(text('span', game.steamInstalled ? 'Steam dosyaları hazır' : game.prepared ? 'Ortam hazırlandı' : 'Özel oyun ortamı'));
    const button = text('button', 'Kurulum ve oynama →', 'card-button'); button.addEventListener('click', () => openGame(game.id)); bottom.append(button);
    body.append(top, text('p', game.tagline), bottom); article.append(cover, body); container.append(article);
  }
}
function renderJobs() {
  const container = $('#jobs'); container.replaceChildren();
  if (!state.jobs.length) container.append(text('p', 'Henüz bir işlem yapılmadı.', 'muted'));
  for (const job of [...state.jobs].reverse()) {
    const card = text('div', '', 'job'); const title = text('div', '', 'job-title');
    title.append(text('span', friendlyJob(job)), text('span', { running: 'Devam ediyor', done: /: (steam|install|play)$/.test(job.label) ? 'Açma isteği gönderildi' : 'Bu işlem bitti', failed: 'İşlem durdu' }[job.state]));
    const details = document.createElement('details'); details.append(text('summary', 'Teknik ayrıntılar'), text('pre', job.log)); card.append(title, details); container.append(card);
  }
  for (const game of state.games) {
    if (!game.runtimeLog) continue;
    const card=text('div','','job'); card.append(text('div',game.name + ' · Son çalıştırma kaydı','job-title'),text('pre',game.runtimeLog)); container.prepend(card);
  }
}
function renderActions() {
  if (!selected) return;
  const game = state.games.find(game => game.id === selected);
  const actions = $('#actions'); actions.replaceChildren();
  $('#gameStatus').replaceChildren(text('span', game.prepared ? 'Ortam hazır' : 'Ortam hazırlanmadı', 'status-chip'), text('span', game.steamInstalled ? 'Steam dosyaları var' : 'Steam kurulmadı', 'status-chip'), text('span', 'Co-op doğrulanmadı', 'status-chip'));
  const buttons = [
    ...(!game.steamInstalled ? [['steamInstall', 'Bu oyun için Steam’i kur', true]] : []),
    ['steam', 'Steam’i aç', game.steamInstalled], ['install', 'Oyunun indirme sayfasını aç', game.steamInstalled],
    ['play', 'Oyunu başlat →', game.steamInstalled], ['stop', 'Ortamı kapat', game.prepared],
  ];
  for (const [action, label, relevant] of buttons) {
    const button = text('button', label, action === 'play' ? 'primary' : 'secondary');
    button.disabled = !state.mac || !state.engine || !relevant || (!!state.busy && action !== 'stop');
    button.addEventListener('click', async () => {
      if (action === 'stop' && !confirm('Bu oyunun Steam’i ve oyun ortamı kapanacak. Önce oyunda kaydettiniz mi?')) return;
      try { await api('action', { game: selected, action }); $('#gameDialog').close(); navigate('logs'); await refresh(); }
      catch (error) { notify(error.message); $('#gameDialog').close(); }
    });
    actions.append(button);
  }
}
function openGame(id) {
  selected = id; const game = state.games.find(game => game.id === id);
  $('#gameTitle').textContent = game.name; $('#gameNote').textContent = game.note;
  $('#gameSource').href = game.source;
  $('#steps').replaceChildren(...game.steps.map(step => text('li', step)));
  $('#testForm').reset(); $('#testResult').textContent = '';
  renderActions(); $('#gameDialog').showModal();
}
$('.dialog-close').addEventListener('click', () => $('#gameDialog').close());
for (const [name, label] of [['launch', 'Oyun açıldı mı?'], ['join', 'Windows odasına katıldınız mı?'], ['host', 'Mac’ten oda kurdunuz mu?'], ['save', 'Dünya kaydedilip tekrar açıldı mı?']]) {
  const element = text('label', label); const select = document.createElement('select'); select.name = name;
  for (const [value, label] of [['unknown', 'Henüz denenmedi'], ['passed', 'Evet, denedim'], ['failed', 'Denedim, çalışmadı']]) { const option = text('option', label); option.value = value; select.append(option); }
  element.append(select); $('#testSelects').append(element);
}
$('#testForm').addEventListener('submit', async event => {
  event.preventDefault(); const result = Object.fromEntries(new FormData(event.target));
  try { await api('test', { game: selected, result }); $('#testResult').textContent = 'Bildiriminiz kaydedildi. Bu sonuç yalnızca yazdığınız cihaz ve sürüm için geçerlidir.'; await refresh(); }
  catch (error) { $('#testResult').textContent = error.message; }
});
document.querySelectorAll('.choose').forEach(button => button.addEventListener('click', async () => {
  try { const result = await api('choose', {}); $('#' + button.dataset.field).value = result.path; }
  catch (error) { notify(error.message); }
}));
$('#importEngine').addEventListener('click', async () => {
  try { await api('engine', { winePath: $('#winePath').value.trim(), dxmtPath: $('#dxmtPath').value.trim() }); navigate('logs'); await refresh(); }
  catch (error) { notify(error.message); }
});
$('#automaticSetup').addEventListener('click', async () => {
  try { await api('setup', {}); navigate('logs'); await refresh(); }
  catch (error) { notify(error.message); }
});
$('#doctor').addEventListener('click', async () => {
  try { await api('doctor', {}); navigate('logs'); await refresh(); }
  catch (error) { notify(error.message); }
});
$('#quit').addEventListener('click', async () => {
  try {
    await api('quit', {});
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    token = null; sessionStorage.removeItem('coop-token');
    notify('Uygulama kapatıldı. Bu sekmeyi kapatabilirsiniz. Açık oyunlar otomatik kapatılmadı.');
  } catch (error) { notify(error.message); }
});
$('#export').addEventListener('click', async () => {
  try {
    const result = await api('export'); const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'coop-test-kayitlari.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notify(error.message); }
});
async function refresh() {
  state = await api('state');
  $('#device').textContent = state.mac ? 'Apple Mac · ' + state.arch : 'Windows / diğer sistem · Önizleme';
  if (!state.mac) notify('Bu bilgisayarda önizleme açık. Oyun başlatma yalnızca Mac’te kullanılabilir. Mac’te oyun ve co-op testleri henüz yapılmadı.');
  $('#engineState').textContent = state.engine ? state.engine.version + ' · DXMT dosyaları kaydedildi · Oyun testi bekleniyor' : 'Henüz motor hazırlanmadı.';
  $('#dataDir').textContent = 'Veriler: ' + state.dataDir;
  $('#importEngine').disabled = !state.mac || !!state.busy;
  $('#automaticSetup').disabled = !state.mac || !!state.busy;
  $('#doctor').disabled = !state.mac || !!state.busy || !state.engine;
  $('#quit').disabled = !!state.busy;
  document.querySelectorAll('.choose').forEach(button => { button.disabled = !state.mac; });
  renderOnboarding(); renderCards(); renderJobs(); if ($('#gameDialog').open) renderActions();
}
async function poll() {
  if (!token) return;
  try { await refresh(); } catch (error) { notify(error.message); }
  if (token) setTimeout(poll, state?.busy ? 1500 : 5000);
}
if (!token) notify('Uygulamayı başlatma dosyasından açın. Bu pencerenin erişim anahtarı eksik.');
else poll();

function friendlyJob(job) {
 const [id, action] = job.label.split(': '), game = state.games.find(g => g.id === id);
 return game ? game.name + ' · ' + ({prepare:'Kurulum hazırlığı',steamInstall:'Steam kurulumu',steam:'Steam açma isteği',install:'Oyun indirme sayfası',play:'Oyun açma isteği',stop:'Kapatma'}[action] || action) : job.label;
}
function renderOnboarding() {
 onboardingId ||= (state.games.find(g=>g.steamInstalled) || state.games.find(g=>g.prepared) || state.games.find(g=>g.id==='palworld')).id;
 const game=state.games.find(g=>g.id===onboardingId), step=!state.engine?1:!game.steamInstalled?2:3;
 $('#setupNumber').textContent='ADIM '+step+' / 3';
 $('#setupTitle').textContent=['','Gerekli dosyaları hazırlayın','Steam’i kurun','Steam’i açıp hesabınıza girin'][step];
 $('#setupDescription').textContent=['','Yaklaşık 210 MB indirilir. En az 4 GB boş alan gerekir. Sonraki adım burada görünecek.','Oyun indirilmez. Steam için gerekli alan otomatik hazırlanır.','Giriş bu sayfada yapılmaz. Açılacak Steam penceresine hesap bilgilerinizi yazın.'][step];
 $('#nextStep').textContent=requesting||state.busy?'İşlem sürüyor… Lütfen bekleyin':['','Kuruluma başla','Steam’i indir ve kur','Steam’i aç →'][step];
 $('#nextStep').disabled=!state.mac||!!state.busy||requesting;
 $('#setupContext').textContent='Bu Steam kurulumu daha sonra '+game.name+' için kullanılacak. Şu an oyuna sahip olmanız gerekmiyor. Diğer oyunlar ayrı kurulur.';
 $('#launchHelp').hidden=step!==3;
 const latest=state.jobs.at(-1);
 $('#setupProgress').textContent=latest?.state==='running'?friendlyJob(latest)+' — bu sayfada bekleyebilirsiniz.':latest?.state==='failed'?'İşlem tamamlanamadı. Yardım bölümünde hata bilgisi var.':launchRequested?'Açma isteği gönderildi. Steam giriş ekranının geldiği henüz doğrulanmadı.':'';
 document.querySelectorAll('.setup-track li').forEach((el,i)=>{el.classList.toggle('current',i+1===step);el.setAttribute('aria-current',i+1===step?'step':'false');});
}
$('#nextStep').addEventListener('click',async()=>{
 if(requesting||state.busy)return;
 requesting=true;renderOnboarding();
 try{const game=state.games.find(g=>g.id===onboardingId);
 if(!state.engine)await api('setup',{});
 else if(!game.steamInstalled)await api('action',{game:onboardingId,action:'steamInstall'});
 else{await api('action',{game:onboardingId,action:'steam'});launchRequested=true;}
 await refresh();}catch(error){notify(error.message);}finally{requesting=false;renderOnboarding();}
});
for(const id of ['setupHelp','steamMissing'])$('#'+id).addEventListener('click',()=>navigate('logs'));

let support;
async function loadSupport() {
 try {
  support = await api('support');
  const container = $('#steamDiagnostics'); container.replaceChildren();
  for (const game of support.games.filter(g=>g.steamInstalled || g.steam.logs.length)) {
   const card=text('div','','job'); card.append(text('h3',game.name+' · Steam hata bilgisi'),text('p',game.steam.hint));
   for(const log of game.steam.logs){const detail=document.createElement('details');detail.append(text('summary',log.name+(log.truncated?' · Son bölüm':'')),text('pre',log.text));card.append(detail);}
   container.append(card);
  }
 }catch(error){$('#copyStatus').textContent=error.message;}
}
$('#copyLogs').addEventListener('click',async()=>{
 try{const report=await api('support');await navigator.clipboard.writeText(JSON.stringify(report,null,2));$('#copyStatus').textContent='Kopyalandı. Paylaşmadan önce özel bilgi içermediğini kontrol edin.';}
 catch{$('#copyStatus').textContent='Kopyalama yapılamadı. Hata bilgilerini dosyaya indir düğmesini kullanın.';}
});
$('#downloadSupport').addEventListener('click',async()=>{
 try{const report=await api('support');const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='coop-steam-hata-kaydi.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#copyStatus').textContent='Dosya hazırlandı. Otomatik gönderilmedi; paylaşmadan önce içeriğini kontrol edin.';}
 catch(error){$('#copyStatus').textContent=error.message;}
});
