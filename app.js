/* ===================== Constantes ===================== */
const STORAGE_KEY = 'tobace_relatorio_sessoes';
const OLD_STORAGE_KEY = 'tobace_relatorio_sessao'; // formato antigo (1 sessão só), migrado se existir
const TOL_MIN = 85;
const TOL_MAX = 95;
const MAX_PHOTO_WIDTH = 1100;
const SEARCH_THRESHOLD = 5; // a partir de quantas notas o campo de busca aparece
const LOGO_MARK_URL = 'assets/logo-mark-color.png';

/* Checklist do setor de Viabilidade — cada pergunta define se o campo de
   detalhe obrigatório aparece quando a resposta é "sim" ou "não" */
const VIAB_CHECKLIST = [
  { id:'jumper', label:'Há possibilidade de abrir/fechar o jumper LV?', detailOn:'sim', detailLabel:'Detalhar situação e qual o ponto para abertura (com pisca ou linha viva)' },
  { id:'chave_definitiva', label:'É necessário instalar chave definitiva?', detailOn:'sim', detailLabel:'Informar pontos passíveis de instalação' },
  { id:'premontagem', label:'Há necessidade ou possibilidade de pré montagem de estruturas?', detailOn:'sim', detailLabel:'Detalhar' },
  { id:'acesso_chuva', label:'Todos os pontos têm acesso quando está chovendo?', detailOn:'nao', detailLabel:'Detalhar ponto sem acesso e prováveis alternativas' },
  { id:'acesso_impedido', label:'Há algum acesso impedido por porteira, ponte, estrada, etc?', detailOn:'sim', detailLabel:'Detalhar situação e solução', extraContacts:true },
  { id:'aterramento', label:'Existe ponto de aterramento ou inversão de fases em alguma estrutura?', detailOn:'nao', detailLabel:'Detalhar onde e quantos pontos serão necessários para execução da obra' },
  { id:'abelha', label:'Existe abelha e/ou insetos no local?', detailOn:'sim', detailLabel:'Detalhar situação e solução' },
  { id:'ocupantes', label:'Existem ocupantes?', detailOn:'sim', detailLabel:'Informar quantos ocupantes estão em tangente, quantos estão em encabeçamento e informar questões de travessia' },
  { id:'poda', label:'É necessário realizar podas em árvores?', detailOn:'sim', detailLabel:'Detalhar quantidade e entre quais pontos existem e se há árvores protegidas — informar mesmo que previstas em projetos' },
  { id:'galhos', label:'É necessário a recolha dos galhos?', detailOn:'sim', detailLabel:'Detalhar quantidade aproximada de recurso' },
  { id:'plantacoes', label:'Há plantações que impedem acesso dos veículos ao poste a ser substituído?', detailOn:'sim', detailLabel:'Detalhar situação e solução — informar se sabe a data da colheita ou se tem acesso por outro local' },
  { id:'estai', label:'Algum poste a ser substituído tem estai de cruzeta?', detailOn:'sim', detailLabel:'Detalhar situação e solução e se o mesmo está seccionado' },
  { id:'cerca', label:'No trecho da obra há alguma cerca não aterrada e não seccionada?', detailOn:'sim', detailLabel:'Detalhar situação e solução' },
  { id:'projeto_campo', label:'O projeto está de acordo com o campo?', detailOn:'nao', detailLabel:'Detalhar pontos divergentes' },
  { id:'feiras', label:'Nos pontos de trabalho existem feiras, eventos, ou condições atípicas no trânsito até o local?', detailOn:'sim', detailLabel:'Detalhar situação e solução' },
  { id:'clientes_criticos', label:'Há clientes críticos no trecho de manobra, como hospitais, escolas, indústrias?', detailOn:'sim', detailLabel:'Detalhar situação e solução' },
  { id:'autorizacao', label:'Há necessidade de autorização de concessionárias ou do DER para execução (também isolação de área específica)?', detailOn:'sim', detailLabel:'Detalhar situação e solução' },
  { id:'veiculos_compridos', label:'No trajeto ou no local os veículos tracionados (mais longos) conseguem chegar no local (sem acesso ou somente toco)?', detailOn:'sim', detailLabel:'Detalhar situação e solução' },
  { id:'redes_subterraneas', label:'Há redes subterrâneas?', detailOn:'sim', detailLabel:'Detalhar situação (quando houver rede subterrânea de distribuição, transmissão, particulares, água, gás e esgoto)' },
  { id:'espacadores', label:'Há espaçadores secundários ou primários para retirar/instalar/reinstalar durante a execução?', detailOn:'sim', detailLabel:'Detalhar situação e solução' },
  { id:'rede_secundaria', label:'Algum ponto terá alguma rede secundária invadindo o trecho?', detailOn:'sim', detailLabel:'Detalhar situação e solução (verificar mediante a proposta de manobra)' },
  { id:'sinal', label:'Durante a viabilidade há sinal de celular ou rádio nos pontos de trabalho e chave para isolação?', detailOn:'nao', detailLabel:'Detalhar o último ponto onde há sinal de celular' },
  { id:'redes_terceiros', label:'No trecho de trabalho há redes aéreas de transmissão de terceiros e/ou particulares?', detailOn:'sim', detailLabel:'Detalhar situação e solução' }
];

/* ===================== Estado ===================== */
let selectedSetor = 'medicao'; // setor escolhido na tela inicial pra criar uma nota nova
let sessions = [];           // [{ id, nota, setor, points:[{ponto, photos:[...], observacao}], viabForm, formPreenchido }]
let activeSessionId = null;  // sessão sendo editada agora na câmera/formulário
let currentPhotos = [];      // fotos do ponto que está sendo montado agora
let editingPointIndex = null; // índice do ponto sendo editado na revisão (null = criando novo)
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
  const searchTerm = $('input-search-nota').value.trim().toLowerCase();
  const searchBlock = $('search-block');
  searchBlock.style.display = sessions.length > SEARCH_THRESHOLD ? 'block' : 'none';

  const visibleSessions = searchTerm
    ? sessions.filter(s => s.nota.toLowerCase().includes(searchTerm))
    : sessions;

  const list = $('sessions-list');
  list.innerHTML = '';
  const template = $('session-card-template');

  visibleSessions.forEach(s=>{
    const node = template.content.cloneNode(true);
    node.querySelector('.nota').textContent = 'Nota ' + s.nota + (s.pdfGerado ? ' ✓' : '');
    node.querySelector('.setor-tag').textContent = s.setor === 'viabilidade' ? 'Viabilidade' : 'Medição';
    const countEl = node.querySelector('.count');
    if(s.compartilhadoEm){
      const ts = formatTimestamp(new Date(s.compartilhadoEm));
      countEl.textContent = s.points.length + (s.points.length===1 ? ' ponto registrado' : ' pontos registrados') + ' · compartilhado em ' + ts.label;
    } else if(s.pdfGerado){
      countEl.innerHTML = s.points.length + (s.points.length===1 ? ' ponto registrado' : ' pontos registrados') + ' · <span style="color:#B8860B; font-weight:bold;">PDF gerado, ainda não compartilhado</span>';
    } else {
      countEl.textContent = s.points.length + (s.points.length===1 ? ' ponto registrado' : ' pontos registrados');
    }
    node.querySelector('.btn-gerar-pdf').textContent = s.pdfGerado ? 'Gerar PDF de novo' : 'Gerar PDF';
    node.querySelector('.btn-continuar').addEventListener('click', ()=>{
      activeSessionId = s.id;
      startGeoWatch();
      goToCameraForNewPoint();
    });
    node.querySelector('.btn-gerar-pdf').addEventListener('click', ()=>{
      if(!s.points.length){ toast('Essa sessão ainda não tem nenhum ponto registrado.'); return; }
      activeSessionId = s.id;
      proceedToReviewOrForm();
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

  $('no-results-msg').style.display = (searchTerm && visibleSessions.length === 0) ? 'block' : 'none';
}

$('input-search-nota').addEventListener('input', renderStartScreen);

document.querySelectorAll('.setor-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    selectedSetor = btn.dataset.setor;
    document.querySelectorAll('.setor-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

$('btn-start-session').addEventListener('click', async ()=>{
  const val = $('input-nota').value.trim();
  if(!val){ toast('Digite o número da nota para continuar.'); return; }

  const existente = sessions.find(s => s.nota.trim().toLowerCase() === val.toLowerCase());
  if(existente){
    const usar = confirm('A nota ' + val + ' já foi criada (' + existente.points.length + ' pontos registrados). Deseja abrir essa sessão em vez de criar uma nova?');
    if(usar){
      activeSessionId = existente.id;
      $('input-nota').value = '';
      startGeoWatch();
      goToCameraForNewPoint();
    }
    return;
  }

  const novaSessao = { id: genId(), nota: val, setor: selectedSetor, points: [], formPreenchido: false };
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
  applySectorCameraUI(s.setor);
}

/* Medição usa o nível 90° (linhas + selo de ângulo); Viabilidade não —
   só grava hora e localização, sem checagem de prumo */
function applySectorCameraUI(setor){
  const isMedicao = setor !== 'viabilidade';
  $('level-line-v-fixed').style.display = isMedicao ? 'block' : 'none';
  $('level-line-v').style.display = isMedicao ? 'block' : 'none';
  $('angle-badge').style.display = isMedicao ? 'block' : 'none';
  $('sensor-note').style.display = isMedicao ? 'block' : 'none';
  if(isMedicao){
    setupOrientationButtonIfNeeded();
  } else {
    $('btn-enable-sensor').style.display = 'none';
  }
}

$('btn-capture').addEventListener('click', capturePhoto);

function drawRoundedRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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

  const s = getActiveSession();
  const isMedicao = !s || s.setor !== 'viabilidade';

  const angle = isMedicao ? currentAngle : null;
  const outOfLevel = angle !== null && (angle < TOL_MIN || angle > TOL_MAX);
  const ts = formatTimestamp(new Date());

  /* linhas de nível gravadas na foto (exigência da GED, só no setor de
     Medição): verde tracejada fixa como referência de vertical reta +
     vermelha acompanhando a leitura do sensor no momento da captura.
     Viabilidade não usa nível — só hora e localização na foto. */
  const lineTop = h * 0.05;
  const lineBottom = h * 0.95;
  const centerX = w / 2;
  const centerY = h / 2;

  if(isMedicao){
    ctx.save();
    ctx.strokeStyle = '#5DCAA5';
    ctx.lineWidth = Math.max(2, Math.round(w*0.0025));
    ctx.setLineDash([Math.round(h*0.014), Math.round(h*0.010)]);
    ctx.beginPath();
    ctx.moveTo(centerX, lineTop);
    ctx.lineTo(centerX, lineBottom);
    ctx.stroke();
    ctx.restore();

    const gammaAtCapture = smoothedGamma !== null ? smoothedGamma : 0;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((-gammaAtCapture) * Math.PI / 180);
    ctx.strokeStyle = '#E24B4A';
    ctx.lineWidth = Math.max(3, Math.round(w*0.004));
    ctx.beginPath();
    ctx.moveTo(0, -(centerY - lineTop));
    ctx.lineTo(0, (lineBottom - centerY));
    ctx.stroke();
    ctx.restore();
  }

  if(angle !== null){
    const angleText = Math.round(angle) + '°';
    ctx.font = `bold ${Math.round(h*0.024)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(angleText).width;
    const badgeY = lineTop + Math.round(h*0.032);
    const bw = tw + Math.round(w*0.045);
    const bh = Math.round(h*0.034);
    ctx.fillStyle = outOfLevel ? 'rgba(226,75,74,0.92)' : 'rgba(99,153,34,0.92)';
    drawRoundedRect(ctx, centerX - bw/2, badgeY - bh/2, bw, bh, bh/2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(angleText, centerX, badgeY + 1);
  }

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
  exitEditMode();
  const s = getActiveSession();
  $('pf-nota-label').textContent = 'Nota ' + (s ? s.nota : '—');
  $('input-ponto').value = nextPontoSuggestion();
  $('input-observacao').value = '';
  showScreen('screen-point-form');
}

function openEditPoint(idx){
  const s = getActiveSession();
  if(!s || !s.points[idx]) return;
  editingPointIndex = idx;
  const p = s.points[idx];
  $('pf-nota-label').textContent = 'Nota ' + s.nota + ' — editando ponto';
  $('input-ponto').value = p.ponto;
  $('input-observacao').value = p.observacao || '';
  $('btn-save-point').textContent = 'Salvar alterações';
  $('btn-finish-nota').style.display = 'none';
  $('btn-cancel-edit').style.display = 'block';
  showScreen('screen-point-form');
}

function exitEditMode(){
  editingPointIndex = null;
  $('btn-save-point').textContent = 'Salvar e ir para o próximo poste';
  $('btn-finish-nota').style.display = 'block';
  $('btn-cancel-edit').style.display = 'none';
}

$('btn-cancel-edit').addEventListener('click', ()=>{
  exitEditMode();
  openReview();
});

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
  proceedToReviewOrForm();
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
  if(editingPointIndex !== null){
    const s = getActiveSession();
    if(!s) return;
    const ponto = $('input-ponto').value.trim();
    if(!ponto){ toast('Informe o número do ponto.'); return; }
    s.points[editingPointIndex].ponto = ponto;
    s.points[editingPointIndex].observacao = $('input-observacao').value.trim();
    await saveSessions();
    toast('Ponto atualizado.');
    exitEditMode();
    openReview();
    return;
  }
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
  proceedToReviewOrForm();
});

/* ===================== Viabilidade: decide se precisa do formulário ===================== */
function proceedToReviewOrForm(){
  const s = getActiveSession();
  if(!s) return;
  if(s.setor === 'viabilidade' && !s.formPreenchido){
    openViabForm();
  } else {
    openReview();
  }
}

/* ===================== Formulário de Viabilidade ===================== */
function openViabForm(){
  const s = getActiveSession();
  if(!s) return;
  const draft = s.viabForm || {};

  $('viab-responsavel').value = draft.responsavel || '';
  $('viab-telefone').value = draft.telefone || '';
  $('viab-chaves-isolacao').value = draft.chavesIsolacao || '';
  $('viab-chaves-referencia').value = draft.chavesReferencia || '';
  $('viab-janela').value = draft.janela || '';
  $('viab-equipes').value = draft.equipes || '';
  $('viab-tempo-deslocamento').value = draft.tempoDeslocamento || '';
  $('viab-tempo-previsto').value = draft.tempoPrevisto || '';
  document.querySelectorAll('.melhor-dia-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.valor === draft.melhorDia);
  });

  renderViabChecklist(draft.checklist || {});
  $('viab-observacoes').value = draft.observacoes || '';

  showScreen('screen-viab-1');
}

document.querySelectorAll('.melhor-dia-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.melhor-dia-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

function renderViabChecklist(respostasSalvas){
  const list = $('viab-checklist-list');
  list.innerHTML = '';
  VIAB_CHECKLIST.forEach(q=>{
    const salvo = respostasSalvas[q.id] || {};
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.dataset.qid = q.id;
    div.innerHTML = `
      <div class="q-label">${q.label}</div>
      <div class="q-toggle">
        <button type="button" class="q-btn q-sim" data-valor="sim">SIM</button>
        <button type="button" class="q-btn q-nao" data-valor="nao">NÃO</button>
      </div>
      <div class="q-detail" style="display:none;">
        <label>${q.detailLabel}</label>
        <textarea class="q-detail-text"></textarea>
        ${q.extraContacts ? `
          <div class="q-contacts">
            <input type="text" class="q-contact1" placeholder="Contato 1 — nome e telefone">
            <input type="text" class="q-contact2" placeholder="Contato 2 — nome e telefone">
          </div>` : ''}
      </div>
    `;
    const btnSim = div.querySelector('.q-sim');
    const btnNao = div.querySelector('.q-nao');
    const detailBox = div.querySelector('.q-detail');

    function selecionar(valor){
      btnSim.classList.toggle('selected-sim', valor === 'sim');
      btnNao.classList.toggle('selected-nao', valor === 'nao');
      div.dataset.resposta = valor;
      detailBox.style.display = (valor === q.detailOn) ? 'block' : 'none';
    }

    btnSim.addEventListener('click', ()=> selecionar('sim'));
    btnNao.addEventListener('click', ()=> selecionar('nao'));

    if(salvo.resposta){
      selecionar(salvo.resposta);
      div.querySelector('.q-detail-text').value = salvo.detalhe || '';
      if(q.extraContacts){
        div.querySelector('.q-contact1').value = salvo.contato1 || '';
        div.querySelector('.q-contact2').value = salvo.contato2 || '';
      }
    }

    list.appendChild(div);
  });
}

$('btn-viab-1-next').addEventListener('click', ()=>{
  const camposObrigatorios = ['viab-responsavel','viab-telefone','viab-chaves-isolacao','viab-chaves-referencia','viab-janela','viab-equipes','viab-tempo-deslocamento','viab-tempo-previsto'];
  for(const id of camposObrigatorios){
    if(!$(id).value.trim()){
      toast('Preencha todos os campos antes de continuar.');
      $(id).focus();
      return;
    }
  }
  const melhorDiaBtn = document.querySelector('.melhor-dia-btn.active');
  if(!melhorDiaBtn){
    toast('Selecione o melhor dia para execução.');
    return;
  }
  showScreen('screen-viab-2');
});

$('btn-viab-2-back').addEventListener('click', ()=> showScreen('screen-viab-1'));

$('btn-viab-2-next').addEventListener('click', ()=>{
  const items = document.querySelectorAll('#viab-checklist-list .checklist-item');
  for(const div of items){
    const resposta = div.dataset.resposta;
    if(!resposta){
      toast('Responda todas as perguntas do checklist antes de continuar.');
      div.scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }
    const q = VIAB_CHECKLIST.find(x => x.id === div.dataset.qid);
    if(resposta === q.detailOn){
      const detalhe = div.querySelector('.q-detail-text').value.trim();
      if(!detalhe){
        toast('Preencha o detalhamento da pergunta: ' + q.label);
        div.scrollIntoView({behavior:'smooth', block:'center'});
        return;
      }
      if(q.extraContacts){
        const c1 = div.querySelector('.q-contact1').value.trim();
        const c2 = div.querySelector('.q-contact2').value.trim();
        if(!c1 || !c2){
          toast('Preencha os dois contatos responsáveis.');
          div.scrollIntoView({behavior:'smooth', block:'center'});
          return;
        }
      }
    }
  }
  showScreen('screen-viab-3');
});

$('btn-viab-3-back').addEventListener('click', ()=> showScreen('screen-viab-2'));

$('btn-viab-3-finish').addEventListener('click', async ()=>{
  const observacoes = $('viab-observacoes').value.trim();
  if(!observacoes){
    toast('Preencha as observações gerais antes de concluir.');
    return;
  }

  const s = getActiveSession();
  if(!s) return;

  const checklist = {};
  document.querySelectorAll('#viab-checklist-list .checklist-item').forEach(div=>{
    const qid = div.dataset.qid;
    checklist[qid] = {
      resposta: div.dataset.resposta,
      detalhe: div.querySelector('.q-detail-text').value.trim(),
      contato1: div.querySelector('.q-contact1') ? div.querySelector('.q-contact1').value.trim() : undefined,
      contato2: div.querySelector('.q-contact2') ? div.querySelector('.q-contact2').value.trim() : undefined
    };
  });

  s.viabForm = {
    responsavel: $('viab-responsavel').value.trim(),
    telefone: $('viab-telefone').value.trim(),
    chavesIsolacao: $('viab-chaves-isolacao').value.trim(),
    chavesReferencia: $('viab-chaves-referencia').value.trim(),
    janela: $('viab-janela').value.trim(),
    equipes: $('viab-equipes').value.trim(),
    tempoDeslocamento: $('viab-tempo-deslocamento').value.trim(),
    tempoPrevisto: $('viab-tempo-previsto').value.trim(),
    melhorDia: document.querySelector('.melhor-dia-btn.active').dataset.valor,
    checklist,
    observacoes
  };
  s.formPreenchido = true;
  await saveSessions();
  toast('Formulário concluído.');
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
      <div class="actions">
        <button class="edit-btn" data-idx="${idx}">Editar</button>
        <button class="del-btn" data-idx="${idx}">Excluir</button>
      </div>
    `;
    list.appendChild(div);
  });
  list.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      openEditPoint(parseInt(btn.dataset.idx, 10));
    });
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
  $('btn-edit-viab-form').style.display = (s.setor === 'viabilidade') ? 'block' : 'none';
  showScreen('screen-review');
}

$('btn-edit-viab-form').addEventListener('click', openViabForm);

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

function addViabilidadeFormPages(doc, sessionObj, logo, pageW, pageH){
  const verdeEscuro = [11,61,35];
  const verde = [35,121,79];
  let y = 0;
  let pageNum = 0;

  function newPage(){
    if(pageNum > 0) doc.addPage();
    pageNum++;
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
    doc.text('Formulário de Viabilidade', 68, 40);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(255,255,255);
    doc.text('Nota ' + sessionObj.nota, pageW-28, 27, {align:'right'});
    y = 80;
  }

  function ensureSpace(neededHeight){
    if(y + neededHeight > pageH - 40) newPage();
  }

  function sectionTitle(text){
    ensureSpace(30);
    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(...verdeEscuro);
    doc.text(text, 28, y);
    y += 6;
    doc.setDrawColor(...verde);
    doc.setLineWidth(1.5);
    doc.line(28, y, pageW-28, y);
    y += 18;
  }

  function fieldLine(label, value){
    ensureSpace(16);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(90,90,90);
    doc.text(label + ':', 28, y);
    const labelW = doc.getTextWidth(label + ': ');
    doc.setFont('helvetica','normal');
    doc.setTextColor(30,30,30);
    const wrapped = doc.splitTextToSize(value || '—', pageW - 56 - labelW);
    doc.text(wrapped, 28 + labelW, y);
    y += Math.max(14, wrapped.length * 12);
  }

  newPage();
  const f = sessionObj.viabForm || {};

  sectionTitle('Identificação');
  fieldLine('Responsável pela viabilidade', f.responsavel);
  fieldLine('Telefone para contato', f.telefone);
  fieldLine('Chaves previstas para isolação/trafos', f.chavesIsolacao);
  fieldLine('Chaves previstas para referência (LV)', f.chavesReferencia);
  fieldLine('Janela prevista para execução', f.janela);
  fieldLine('Equipes previstas para execução', f.equipes);
  fieldLine('Tempo médio de deslocamento da base até a obra', f.tempoDeslocamento);
  fieldLine('Tempo previsto para execução', f.tempoPrevisto);
  fieldLine('Melhor dia para execução', f.melhorDia === 'fds' ? 'Final de semana' : 'Dia de semana');

  y += 10;
  sectionTitle('Checklist técnico');

  VIAB_CHECKLIST.forEach(q=>{
    const resp = (f.checklist && f.checklist[q.id]) || {};
    const respostaTexto = resp.resposta === 'sim' ? 'SIM' : (resp.resposta === 'nao' ? 'NÃO' : '—');
    const precisaAtencao = resp.resposta === q.detailOn;

    ensureSpace(30);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...verdeEscuro);
    const qWrapped = doc.splitTextToSize(q.label, pageW - 56 - 40);
    doc.text(qWrapped, 28, y);

    doc.setFontSize(9);
    if(precisaAtencao){ doc.setTextColor(226,75,74); } else { doc.setTextColor(99,153,34); }
    doc.text(respostaTexto, pageW-28, y, {align:'right'});
    y += qWrapped.length * 11 + 4;

    if(precisaAtencao && resp.detalhe){
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.setTextColor(60,60,60);
      const detWrapped = doc.splitTextToSize('Detalhe: ' + resp.detalhe, pageW-56);
      ensureSpace(detWrapped.length*11+4);
      doc.text(detWrapped, 28, y);
      y += detWrapped.length*11+4;

      if(q.extraContacts && (resp.contato1 || resp.contato2)){
        const contatosTexto = 'Contatos: ' + [resp.contato1, resp.contato2].filter(Boolean).join(' · ');
        const cWrapped = doc.splitTextToSize(contatosTexto, pageW-56);
        ensureSpace(cWrapped.length*11+4);
        doc.text(cWrapped, 28, y);
        y += cWrapped.length*11+4;
      }
    }
    y += 6;
  });

  y += 10;
  sectionTitle('Observações gerais');
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.setTextColor(30,30,30);
  const obsWrapped = doc.splitTextToSize(f.observacoes || '—', pageW-56);
  ensureSpace(obsWrapped.length*13);
  doc.text(obsWrapped, 28, y);
  y += obsWrapped.length*13;
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

  if(sessionObj.setor === 'viabilidade'){
    addViabilidadeFormPages(doc, sessionObj, logo, pageW, pageH);
  }

  sessionObj.points.forEach((p, idx)=>{
    if(idx>0 || sessionObj.setor === 'viabilidade') doc.addPage();

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
      if(s){
        s.compartilhadoEm = Date.now();
        await saveSessions();
      }
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
