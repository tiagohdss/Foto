/* ===================== Constantes ===================== */
const STORAGE_KEY = 'tobace_relatorio_sessoes';
const OLD_STORAGE_KEY = 'tobace_relatorio_sessao'; // formato antigo (1 sessão só), migrado se existir
const TOL_MIN = 85;
const TOL_MAX = 95;
const MAX_PHOTO_WIDTH = 1100;
const MAX_SESSIONS = 3;
const LOGO_MARK_URL = 'assets/logo-mark-color.png';

/* ===================== Estado ===================== */
let sessions = [];           // [{ id, nota, points:[{ponto, photos:[...], observacao}] }]
let activeSessionId = null;  // sessão sendo editada agora na câmera/formulário
let currentPhotos = [];      // fotos do ponto que está sendo montado agora
let currentAngle = null;     // última leitura do sensor
let sensorReady = false;
let stream = null;
let logoDataUrl = null;      // cache do logo em base64 pro PDF
let geoWatchId = null;
let lastPosition = null;     // { lat, lon, ts }
let lastStreetName = null;   // nome da rua, quando encontrado
let lastGeocodeTs = 0;

/* ===================== Geolocalização ===================== */
function startGeoWatch(){
  if(!navigator.geolocation || geoWatchId !== null) return;
  try{
    geoWatchId = navigator.geolocation.watchPosition(
      (pos)=>{
        lastPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
        tryReverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      ()=>{ /* falhou ou negado — segue sem localização, tratado na captura */ },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );
  }catch(e){ /* navegador sem suporte */ }
}

/* busca o nome da rua a partir da coordenada (Nominatim/OpenStreetMap,
   serviço gratuito). Limitado a 1x a cada 45s, tanto por respeito à
   política de uso do serviço quanto pra não travar em área sem sinal. */
async function tryReverseGeocode(lat, lon){
  const now = Date.now();
  if(now - lastGeocodeTs < 45000) return;
  lastGeocodeTs = now;
  try{
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=17&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    const data = await res.json();
    const addr = data && data.address;
    if(addr){
      const rua = addr.road || addr.pedestrian || addr.footway || addr.residential || null;
      if(rua){
        const bairro = addr.suburb || addr.village || addr.town || addr.city_district || '';
        lastStreetName = bairro ? `${rua} - ${bairro}` : rua;
      }
    }
  }catch(e){ /* sem internet ou serviço fora do ar — segue sem nome de rua */ }
}

function getGeoLabel(){
  const MAX_AGE_MS = 120000; // aceita posição de até 2 min atrás, evita travar a captura esperando GPS
  if(lastPosition && (Date.now() - lastPosition.ts) < MAX_AGE_MS){
    const coords = `${lastPosition.lat.toFixed(5)}, ${lastPosition.lon.toFixed(5)}`;
    return lastStreetName ? `${lastStreetName} · ${coords}` : coords;
  }
  return 'localização indisponível';
}

/* ===================== Armazenamento (IndexedDB) ===================== */
/* Trocado de localStorage pra IndexedDB: localStorage tem limite de ~5MB,
   insuficiente pra guardar várias fotos em base64. IndexedDB aguenta
   ordens de grandeza a mais, o que é necessário aqui. */
const DB_NAME = 'tobace_relatorio_db';
const DB_STORE_NAME = 'kv';
const DB_KEY = 'sessions';

let dbConnectionPromise = null;
function openDb(){
  if(dbConnectionPromise) return dbConnectionPromise;
  dbConnectionPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(DB_STORE_NAME); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=>{ dbConnectionPromise = null; reject(req.error); };
  });
  return dbConnectionPromise;
}

function withTimeout(promise, ms, label){
  return new Promise((resolve, reject)=>{
    const t = setTimeout(()=>{
      reject(new Error('TRAVOU: ' + label + ' não respondeu em ' + (ms/1000) + 's — bug conhecido de IndexedDB em apps instalados na tela inicial de alguns iPhones/navegadores'));
    }, ms);
    promise.then((v)=>{ clearTimeout(t); resolve(v); }, (e)=>{ clearTimeout(t); reject(e); });
  });
}

async function idbGet(key){
  const db = await openDb();
  const p = new Promise((resolve, reject)=>{
    const tx = db.transaction(DB_STORE_NAME, 'readonly');
    const req = tx.objectStore(DB_STORE_NAME).get(key);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return withTimeout(p, 6000, 'leitura do banco local');
}

async function idbSet(key, value){
  const db = await openDb();
  const p = new Promise((resolve, reject)=>{
    const tx = db.transaction(DB_STORE_NAME, 'readwrite');
    tx.objectStore(DB_STORE_NAME).put(value, key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
  return withTimeout(p, 6000, 'gravação no banco local');
}

/* ===================== Utilitários ===================== */
function $(id){ return document.getElementById(id); }

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function toast(msg, ms=2500){
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>{ t.style.display='none'; }, ms);
}

function genId(){
  return 'sess_' + Date.now() + '_' + Math.round(Math.random()*1e6);
}

function saveSessions(){
  return idbSet(DB_KEY, sessions)
    .then(()=>{
      /* diagnóstico temporário — confirma visualmente que o dado foi
         gravado de verdade, sem precisar abrir o console */
      console.log('saveSessions OK, sessions=', sessions.length);
    })
    .catch((e)=>{
      const msg = (e && (e.message || e.name)) ? (e.message || e.name) : 'erro desconhecido';
      toast('FALHA AO SALVAR: ' + msg, 8000);
      console.error('saveSessions FALHOU:', e);
    });
}

async function loadSessions(){
  try{
    const data = await idbGet(DB_KEY);
    if(Array.isArray(data)) return data;
  }catch(e){ console.error(e); }

  /* migração de dados de versões antigas do app, que usavam localStorage
     (limite pequeno, ~5MB — por isso a troca pra IndexedDB) */
  try{
    const rawArray = localStorage.getItem(STORAGE_KEY);
    if(rawArray){
      const parsed = JSON.parse(rawArray);
      if(Array.isArray(parsed)){
        localStorage.removeItem(STORAGE_KEY);
        await idbSet(DB_KEY, parsed);
        return parsed;
      }
    }
    const rawOld = localStorage.getItem(OLD_STORAGE_KEY);
    if(rawOld){
      const old = JSON.parse(rawOld);
      if(old && old.points){
        const migrated = [{ id: genId(), nota: old.nota, points: old.points }];
        localStorage.removeItem(OLD_STORAGE_KEY);
        await idbSet(DB_KEY, migrated);
        return migrated;
      }
    }
  }catch(e){ console.error(e); }

  return [];
}

function getActiveSession(){
  return sessions.find(s => s.id === activeSessionId) || null;
}

function nextPontoSuggestion(){
  const s = getActiveSession();
  if(!s || !s.points.length) return '01';
  const last = s.points[s.points.length - 1].ponto;
  const num = parseInt(last, 10);
  if(isNaN(num)) return '';
  const next = num + 1;
  return String(next).padStart(String(last).length, '0');
}

function formatTimestamp(d){
  const pad = n => String(n).padStart(2,'0');
  const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const data = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  return { hora, data, label: `${hora} · ${data}` };
}

/* ===================== Tela inicial ===================== */
async function initStartScreen(){
  sessions = await loadSessions();
  activeSessionId = null;
  renderStartScreen();
}

function renderStartScreen(){
  const noSession = $('no-session-block');
  const limitBlock = $('limit-block');
  const atLimit = sessions.length >= MAX_SESSIONS;

  noSession.style.display = atLimit ? 'none' : 'block';
  limitBlock.style.display = atLimit ? 'block' : 'none';

  const list = $('sessions-list');
  list.innerHTML = '';
  const template = $('session-card-template');

  sessions.forEach(s=>{
    const node = template.content.cloneNode(true);
    node.querySelector('.nota').textContent = 'Nota ' + s.nota + (s.pdfGerado ? ' ✓' : '');
    node.querySelector('.count').textContent = s.points.length + (s.points.length===1 ? ' ponto registrado' : ' pontos registrados') + (s.pdfGerado ? ' · PDF já gerado' : '');
    node.querySelector('.btn-gerar-pdf').textContent = s.pdfGerado ? 'Gerar PDF de novo' : 'Gerar PDF';
    node.querySelector('.btn-continuar').addEventListener('click', ()=>{
      activeSessionId = s.id;
      startGeoWatch();
      goToCameraForNewPoint();
    });
    node.querySelector('.btn-gerar-pdf').addEventListener('click', ()=>{
      if(!s.points.length){ toast('Essa sessão ainda não tem nenhum ponto registrado.'); return; }
      activeSessionId = s.id;
      openReview();
    });
    node.querySelector('.btn-descartar').addEventListener('click', async ()=>{
      if(confirm('Descartar a sessão da nota ' + s.nota + '? As fotos ainda não geradas em PDF serão perdidas.')){
        sessions = sessions.filter(x => x.id !== s.id);
        await saveSessions();
        renderStartScreen();
      }
    });
    list.appendChild(node);
  });
}

$('btn-start-session').addEventListener('click', async ()=>{
  if(sessions.length >= MAX_SESSIONS){
    toast('Limite de 3 sessões atingido. Descarte ou gere o PDF de alguma antes de continuar.');
    return;
  }
  const val = $('input-nota').value.trim();
  if(!val){ toast('Digite o número da nota para continuar.'); return; }
  const novaSessao = { id: genId(), nota: val, points: [] };
  sessions.push(novaSessao);
  activeSessionId = novaSessao.id;
  await saveSessions();
  $('input-nota').value = '';
  startGeoWatch();
  goToCameraForNewPoint();
});

/* ===================== Câmera ===================== */
async function startCamera(){
  try{
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: {ideal: 1280}, height: {ideal: 1707} },
      audio: false
    });
    $('video').srcObject = stream;
  }catch(e){
    toast('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
  }
}

function stopCamera(){
  if(stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function goToCameraForNewPoint(){
  const s = getActiveSession();
  if(!s){ showScreen('screen-start'); renderStartScreen(); return; }
  $('cam-nota-label').textContent = 'Nota ' + s.nota;
  $('cam-point-label').textContent = 'Sugestão: ponto ' + nextPontoSuggestion();
  showScreen('screen-camera');
  startCamera();
  setupOrientationButtonIfNeeded();
}

$('btn-capture').addEventListener('click', capturePhoto);

function truncateToWidth(ctx, text, maxWidth){
  if(ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while(t.length > 1 && ctx.measureText(t + '…').width > maxWidth){
    t = t.slice(0, -1);
  }
  return t + '…';
}

function capturePhoto(){
  const video = $('video');
  if(!video.videoWidth){ toast('Aguarde a câmera carregar.'); return; }

  const scale = MAX_PHOTO_WIDTH / video.videoWidth;
  const w = MAX_PHOTO_WIDTH;
  const h = Math.round(video.videoHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  const angle = currentAngle;
  const outOfLevel = angle !== null && (angle < TOL_MIN || angle > TOL_MAX);
  const ts = formatTimestamp(new Date());

  /* aviso de fora do prumo, gravado na foto */
  if(outOfLevel){
    ctx.fillStyle = 'rgba(226,75,74,0.92)';
    ctx.fillRect(0, 0, w, Math.round(h*0.065));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(h*0.03)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`fora do prumo — ${Math.round(angle)}°`, w/2, Math.round(h*0.0325));
  }

  /* hora/data + localização, gravado na foto (exigência da GED) */
  const geoLabelRaw = getGeoLabel();
  const padX = Math.round(w*0.035);
  const lineH = Math.round(h*0.038);
  const boxH = lineH*2 + Math.round(h*0.026);
  const boxY = h - boxH - Math.round(h*0.025);
  const fontSize = Math.round(h*0.026);
  ctx.font = `bold ${fontSize}px Arial`;

  const maxTextW = w - padX*2 - 20;
  const line1 = ts.label;
  const line2 = truncateToWidth(ctx, geoLabelRaw, maxTextW);
  const textW = Math.min(Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width), maxTextW);

  /* caixa no verde-escuro da Tobace, com friso na cor verde clara da marca */
  ctx.fillStyle = 'rgba(11,61,35,0.90)';
  ctx.fillRect(padX - 12, boxY, textW + 24, boxH);
  ctx.fillStyle = '#23794F';
  ctx.fillRect(padX - 12, boxY, textW + 24, 5);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(line1, padX, boxY + lineH*0.95 + 5);
  ctx.fillText(line2, padX, boxY + lineH*1.95 + 5);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.68);

  window._pendingPhoto = { dataUrl, angle, outOfLevel, timeLabel: ts.label, geoLabel: geoLabelRaw };
  $('confirm-img').src = dataUrl;
  stopCamera();
  showScreen('screen-confirm');
}

$('btn-retake').addEventListener('click', ()=>{
  showScreen('screen-camera');
  startCamera();
});

$('btn-accept-photo').addEventListener('click', ()=>{
  currentPhotos.push(window._pendingPhoto);
  window._pendingPhoto = null;
  const s = getActiveSession();
  $('more-nota-label').textContent = 'Nota ' + (s ? s.nota : '—');
  $('more-point-label').textContent = 'Sugestão: ponto ' + nextPontoSuggestion();
  showScreen('screen-more');
});

/* ===================== Mais uma foto? ===================== */
$('btn-more-yes').addEventListener('click', ()=>{
  showScreen('screen-camera');
  startCamera();
});

$('btn-more-no').addEventListener('click', ()=>{
  goToPointForm();
});

function goToPointForm(){
  const s = getActiveSession();
  $('pf-nota-label').textContent = 'Nota ' + (s ? s.nota : '—');
  $('input-ponto').value = nextPontoSuggestion();
  $('input-observacao').value = '';
  showScreen('screen-point-form');
}

/* ===================== Finalizar sessão direto da câmera ===================== */
$('btn-finish-session-cam').addEventListener('click', ()=>{
  if(currentPhotos.length){
    /* tem foto(s) tirada(s) mas ainda não salvas nesse ponto — manda
       primeiro pro formulário de ponto, pra não perder a foto */
    toast('Confirme os dados desse ponto antes de encerrar a sessão.');
    goToPointForm();
    return;
  }
  const s = getActiveSession();
  if(!s || !s.points.length){
    toast('Registre ao menos um ponto antes de finalizar a sessão.');
    return;
  }
  stopCamera();
  openReview();
});

/* ===================== Formulário do ponto ===================== */
async function commitCurrentPoint(){
  const s = getActiveSession();
  if(!s) return false;
  const ponto = $('input-ponto').value.trim();
  if(!ponto){ toast('Informe o número do ponto.'); return false; }
  if(!currentPhotos.length){ toast('Nenhuma foto registrada para este ponto.'); return false; }
  const observacao = $('input-observacao').value.trim();
  s.points.push({ ponto, photos: currentPhotos.slice(), observacao });
  currentPhotos = [];
  await saveSessions();
  return true;
}

$('btn-save-point').addEventListener('click', async ()=>{
  if(await commitCurrentPoint()){
    const s = getActiveSession();
    toast('Ponto salvo (' + (s ? s.points.length : '?') + ' pontos nessa nota agora)', 3000);
    goToCameraForNewPoint();
  }
});

$('btn-finish-nota').addEventListener('click', async ()=>{
  if(currentPhotos.length){
    if(!(await commitCurrentPoint())) return;
  }
  const s = getActiveSession();
  if(!s || !s.points.length){
    toast('Registre ao menos um ponto antes de finalizar.');
    return;
  }
  openReview();
});

/* ===================== Revisão ===================== */
function openReview(){
  const s = getActiveSession();
  if(!s){ showScreen('screen-start'); renderStartScreen(); return; }
  $('review-nota-label').textContent = 'Nota ' + s.nota;
  const list = $('review-list');
  list.innerHTML = '';
  s.points.forEach((p, idx)=>{
    const anyOut = p.photos.some(ph => ph.outOfLevel);
    const div = document.createElement('div');
    div.className = 'point-item';
    div.innerHTML = `
      <img src="${p.photos[0].dataUrl}" alt="">
      <div class="info">
        <div class="p-num">Ponto ${p.ponto} ${anyOut ? '<span style="color:#E24B4A;">· fora do prumo</span>' : ''}</div>
        <div class="p-meta">${p.photos.length} foto${p.photos.length>1?'s':''} · ${p.photos[0].timeLabel}</div>
      </div>
      <button class="del-btn" data-idx="${idx}">Excluir</button>
    `;
    list.appendChild(div);
  });
  list.querySelectorAll('.del-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = parseInt(btn.dataset.idx, 10);
      if(confirm('Excluir o ponto ' + s.points[idx].ponto + '?')){
        s.points.splice(idx, 1);
        saveSessions();
        openReview();
      }
    });
  });
  showScreen('screen-review');
}

$('btn-back-to-camera').addEventListener('click', goToCameraForNewPoint);

/* ===================== Sensor de nível (90°) ===================== */
function setupOrientationButtonIfNeeded(){
  const needsPermission = typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function';
  if(needsPermission && !sensorReady){
    $('btn-enable-sensor').style.display = 'block';
  } else if(!sensorReady){
    attachOrientationListener();
  }
}

$('btn-enable-sensor').addEventListener('click', async ()=>{
  try{
    const res = await DeviceOrientationEvent.requestPermission();
    if(res === 'granted'){
      attachOrientationListener();
      $('btn-enable-sensor').style.display = 'none';
    } else {
      toast('Permissão de sensor negada. Não será possível checar o prumo pelo celular.');
    }
  }catch(e){
    toast('Não foi possível ativar o sensor neste aparelho.');
  }
});

function attachOrientationListener(){
  if(sensorReady) return;
  sensorReady = true;
  window.addEventListener('deviceorientation', onOrientation);
}

let smoothedGamma = null;

function onOrientation(e){
  /* gamma = inclinação esquerda/direita (rolagem), é o que faz o poste
     parecer torto na foto. beta (frente/trás) só muda a mira da câmera
     pra cima/baixo e não afeta o prumo aparente, por isso não é usado. */
  if(e.gamma === null || e.gamma === undefined) return;

  /* suaviza a leitura (média móvel exponencial) pra não ficar tremendo
     a cada pequena vibração da mão do encarregado */
  smoothedGamma = (smoothedGamma === null) ? e.gamma : (smoothedGamma * 0.82 + e.gamma * 0.18);

  const angle = 90 + smoothedGamma;
  currentAngle = angle;
  updateLevelUI(angle, smoothedGamma);
}

function updateLevelUI(angle, gamma){
  const badge = $('angle-badge');
  const redLine = $('level-line-v');
  const ok = angle >= TOL_MIN && angle <= TOL_MAX;
  badge.textContent = Math.round(angle) + '° ' + (ok ? '· no prumo' : '· fora do prumo');
  badge.classList.toggle('ok', ok);
  redLine.style.transform = `translateX(-1.5px) rotate(${-gamma}deg)`;
}

/* fallback: se depois de 1.5s não veio leitura nenhuma, avisa que o sensor não respondeu */
setInterval(()=>{
  if(currentAngle === null && document.getElementById('screen-camera').classList.contains('active')){
    $('sensor-note').textContent = 'Sensor de nível indisponível neste aparelho ou navegador — use apenas o nível a laser físico.';
  }
}, 4000);

/* ===================== Geração do PDF ===================== */
async function loadLogoAsDataUrl(){
  if(logoDataUrl) return logoDataUrl;
  const res = await fetch(LOGO_MARK_URL);
  const blob = await res.blob();
  return new Promise(resolve=>{
    const reader = new FileReader();
    reader.onload = () => { logoDataUrl = reader.result; resolve(logoDataUrl); };
    reader.readAsDataURL(blob);
  });
}

async function generatePdf(sessionObj){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const verdeEscuro = [11,61,35];
  const vermelhoClaro = [247,193,193];
  const vermelhoTexto = [121,31,31];

  const logo = await loadLogoAsDataUrl();

  sessionObj.points.forEach((p, idx)=>{
    if(idx>0) doc.addPage();

    /* cabeçalho */
    doc.setFillColor(...verdeEscuro);
    doc.rect(0,0,pageW,54,'F');
    try{ doc.addImage(logo, 'PNG', 28, 12, 30, 30); }catch(e){}
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.text('B. Tobace', 68, 27);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(159,225,203);
    doc.text('Relatório fotográfico', 68, 40);
    doc.text('Relatório fotográfico', pageW-28, 27, {align:'right'});

    /* faixa de metadados */
    let y = 80;
    doc.setTextColor(11,61,35);
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text('Nota ' + sessionObj.nota, 28, y);
    doc.text('Ponto ' + p.ponto, 170, y);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(90,90,90);
    doc.text(p.photos[0].timeLabel, 280, y);

    doc.setFontSize(8);
    doc.setTextColor(120,120,120);
    const geoText = 'Local: ' + (p.photos[0].geoLabel || 'indisponível');
    doc.text(geoText, 28, y + 12);

    const anyOut = p.photos.some(ph=>ph.outOfLevel);
    if(anyOut){
      const badgeText = 'fora do prumo';
      doc.setFontSize(9);
      const bw = doc.getTextWidth(badgeText) + 20;
      doc.setFillColor(...vermelhoClaro);
      doc.roundedRect(pageW-28-bw, y-12, bw, 18, 9, 9, 'F');
      doc.setTextColor(...vermelhoTexto);
      doc.setFont('helvetica','bold');
      doc.text(badgeText, pageW-28-bw/2, y, {align:'center'});
    }

    doc.setDrawColor(210,210,205);
    doc.line(28, y+22, pageW-28, y+22);

    /* fotos */
    const photoTop = y + 42;
    const availW = pageW - 56;
    const maxPhotoH = 360;
    let afterPhotosY;
    if(p.photos.length === 1){
      const img = p.photos[0];
      const dims = fitImage(availW, maxPhotoH, img.dataUrl);
      addPhotoWithFrame(doc, img, 28, photoTop, dims.w, dims.h);
      afterPhotosY = photoTop + dims.h + 20;
    } else {
      const gap = 12;
      const colW = (availW - gap) / 2;
      const dims0 = fitImage(colW, maxPhotoH, p.photos[0].dataUrl);
      const dims1 = fitImage(colW, maxPhotoH, p.photos[1].dataUrl);
      const rowH = Math.max(dims0.h, dims1.h);
      addPhotoWithFrame(doc, p.photos[0], 28, photoTop, colW, rowH);
      addPhotoWithFrame(doc, p.photos[1], 28+colW+gap, photoTop, colW, rowH);
      afterPhotosY = photoTop + rowH + 20;
    }

    /* observação */
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(120,120,120);
    doc.text('Observação', 28, afterPhotosY);
    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    doc.setTextColor(30,30,30);
    const obsText = p.observacao ? p.observacao : '—';
    const wrapped = doc.splitTextToSize(obsText, pageW-56);
    doc.text(wrapped, 28, afterPhotosY + 16);

    /* rodapé */
    doc.setFillColor(...verdeEscuro);
    doc.rect(0, pageH-26, pageW, 26, 'F');
    doc.setFontSize(8);
    doc.setTextColor(255,255,255);
    doc.text('B. Tobace Instalações Elétricas e Telefônicas Ltda', 28, pageH-10);
    doc.setTextColor(159,225,203);
    doc.text('Página ' + (idx+1) + ' de ' + sessionObj.points.length, pageW-28, pageH-10, {align:'right'});
  });

  return doc;
}

function fitImage(maxW, maxH, dataUrl){
  /* proporção 3:4 (retrato), como capturado pela câmera */
  let w = maxW;
  let h = w * (4/3);
  if(h > maxH){ h = maxH; w = h * (3/4); }
  return { w, h };
}

function addPhotoWithFrame(doc, img, x, y, w, h){
  doc.setDrawColor(210,210,205);
  doc.rect(x, y, w, h);
  try{ doc.addImage(img.dataUrl, 'JPEG', x, y, w, h); }catch(e){}
}

$('btn-generate-pdf').addEventListener('click', async ()=>{
  const s = getActiveSession();
  if(!s) return;
  $('btn-generate-pdf').textContent = 'Gerando…';
  $('btn-generate-pdf').disabled = true;
  try{
    const doc = await generatePdf(s);
    window._lastPdf = doc;
    window._lastPdfName = `relatorio_nota_${s.nota}.pdf`;
    window._lastPdfSessionId = s.id;
    s.pdfGerado = true;
    await saveSessions();
    showScreen('screen-done');
  }catch(e){
    toast('Erro ao gerar o PDF. Tente novamente.');
    console.error(e);
  }
  $('btn-generate-pdf').textContent = 'Gerar relatório em PDF';
  $('btn-generate-pdf').disabled = false;
});

$('btn-download-pdf').addEventListener('click', ()=>{
  if(window._lastPdf) window._lastPdf.save(window._lastPdfName);
});

function buildShareText(sessionObj){
  const total = sessionObj.points.length;
  const foraDoPrumo = sessionObj.points.filter(p => p.photos.some(ph => ph.outOfLevel)).length;
  const hoje = formatTimestamp(new Date()).data;
  let txt = `Relatório fotográfico — Nota ${sessionObj.nota}\n`;
  txt += `${total} ponto${total===1?'':'s'} registrado${total===1?'':'s'} · ${hoje}`;
  if(foraDoPrumo > 0){
    txt += `\n⚠ ${foraDoPrumo} ponto${foraDoPrumo===1?'':'s'} fora do prumo`;
  }
  return txt;
}

$('btn-share-pdf').addEventListener('click', async ()=>{
  if(!window._lastPdf) return;
  const s = sessions.find(x => x.id === window._lastPdfSessionId);
  const blob = window._lastPdf.output('blob');
  const file = new File([blob], window._lastPdfName, {type:'application/pdf'});
  const shareText = s ? buildShareText(s) : ('Relatório — ' + window._lastPdfName);
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({ files:[file], title:'Relatório fotográfico', text: shareText });
      return;
    }catch(e){ /* usuário cancelou ou falhou, cai no download */ }
  }
  window._lastPdf.save(window._lastPdfName);
  toast('Compartilhamento direto não disponível neste navegador — o PDF foi baixado.');
});

$('btn-new-session').addEventListener('click', ()=>{
  /* a sessão cujo PDF acabou de ser gerado continua na lista, marcada
     como concluída — só some da lista se o encarregado descartar manualmente */
  activeSessionId = null;
  showScreen('screen-start');
  renderStartScreen();
});

/* ===================== Diagnóstico de erros ===================== */
window.addEventListener('error', (e)=>{
  toast('Erro no app: ' + (e.message || 'falha desconhecida') + ' — tire um print e envie.', 6000);
});

/* ===================== Início ===================== */
initStartScreen();

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
