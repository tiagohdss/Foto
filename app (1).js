/* ===================== Constantes ===================== */
const STORAGE_KEY = 'tobace_relatorio_sessao';
const TOL_MIN = 85;
const TOL_MAX = 95;
const MAX_PHOTO_WIDTH = 1280;
const LOGO_MARK_URL = 'assets/logo-mark-color.png';

/* ===================== Estado ===================== */
let session = null;          // { nota, points: [{ponto, photos:[{dataUrl, angle, outOfLevel, timeLabel}], observacao}] }
let currentPhotos = [];      // fotos do ponto que está sendo montado agora
let currentAngle = null;     // última leitura do sensor
let sensorReady = false;
let stream = null;
let logoDataUrl = null;      // cache do logo em base64 pro PDF

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

function saveSession(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }catch(e){
    toast('Aviso: memória do celular cheia. Gere o relatório logo para não perder as fotos.');
  }
}

function loadSession(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){ return null; }
}

function clearSession(){
  localStorage.removeItem(STORAGE_KEY);
  session = null;
  currentPhotos = [];
}

function nextPontoSuggestion(){
  if(!session.points.length) return '01';
  const last = session.points[session.points.length - 1].ponto;
  const num = parseInt(last, 10);
  if(isNaN(num)) return '';
  const next = num + 1;
  return String(next).padStart(String(last).length, '0');
}

function formatTimestamp(d){
  const dias = ['dom','seg','ter','qua','qui','sex','sáb'];
  const pad = n => String(n).padStart(2,'0');
  const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const data = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  return { hora, data, label: `${hora} · ${data}` };
}

/* ===================== Tela inicial ===================== */
function initStartScreen(){
  session = loadSession();
  const noSession = $('no-session-block');
  const resumeBlock = $('resume-block');
  if(session && session.points){
    noSession.style.display = 'none';
    resumeBlock.style.display = 'block';
    $('resume-nota').textContent = 'Nota ' + session.nota;
    $('resume-count').textContent = session.points.length + (session.points.length===1 ? ' ponto registrado' : ' pontos registrados');
  } else {
    noSession.style.display = 'block';
    resumeBlock.style.display = 'none';
  }
}

$('btn-start-session').addEventListener('click', ()=>{
  const val = $('input-nota').value.trim();
  if(!val){ toast('Digite o número da nota para continuar.'); return; }
  session = { nota: val, points: [] };
  saveSession();
  goToCameraForNewPoint();
});

$('btn-resume').addEventListener('click', ()=>{
  session = loadSession();
  goToCameraForNewPoint();
});

$('btn-discard').addEventListener('click', ()=>{
  if(confirm('Descartar a sessão em andamento? As fotos ainda não geradas em PDF serão perdidas.')){
    clearSession();
    initStartScreen();
  }
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
  $('cam-nota-label').textContent = 'Nota ' + session.nota;
  $('cam-point-label').textContent = 'Sugestão: ponto ' + nextPontoSuggestion();
  showScreen('screen-camera');
  startCamera();
  setupOrientationButtonIfNeeded();
}

$('btn-capture').addEventListener('click', capturePhoto);

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

  /* hora/data, gravado na foto */
  const padX = Math.round(w*0.03);
  const boxH = Math.round(h*0.05);
  const boxY = h - boxH - Math.round(h*0.02);
  ctx.font = `${Math.round(h*0.022)}px Arial`;
  const label = ts.label;
  const textW = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(11,61,35,0.82)';
  ctx.fillRect(padX - 8, boxY - 6, textW + 16, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, padX, boxY + boxH/2 - 4);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.68);

  window._pendingPhoto = { dataUrl, angle, outOfLevel, timeLabel: ts.label };
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
  $('more-nota-label').textContent = 'Nota ' + session.nota;
  $('more-point-label').textContent = 'Sugestão: ponto ' + nextPontoSuggestion();
  showScreen('screen-more');
});

/* ===================== Mais uma foto? ===================== */
$('btn-more-yes').addEventListener('click', ()=>{
  showScreen('screen-camera');
  startCamera();
});

$('btn-more-no').addEventListener('click', ()=>{
  $('pf-nota-label').textContent = 'Nota ' + session.nota;
  $('input-ponto').value = nextPontoSuggestion();
  $('input-observacao').value = '';
  showScreen('screen-point-form');
});

/* ===================== Formulário do ponto ===================== */
function commitCurrentPoint(){
  const ponto = $('input-ponto').value.trim();
  if(!ponto){ toast('Informe o número do ponto.'); return false; }
  if(!currentPhotos.length){ toast('Nenhuma foto registrada para este ponto.'); return false; }
  const observacao = $('input-observacao').value.trim();
  session.points.push({ ponto, photos: currentPhotos.slice(), observacao });
  currentPhotos = [];
  saveSession();
  return true;
}

$('btn-save-point').addEventListener('click', ()=>{
  if(commitCurrentPoint()){
    goToCameraForNewPoint();
  }
});

$('btn-finish-nota').addEventListener('click', ()=>{
  if(currentPhotos.length){
    if(!commitCurrentPoint()) return;
  }
  if(!session.points.length){
    toast('Registre ao menos um ponto antes de finalizar.');
    return;
  }
  openReview();
});

/* ===================== Revisão ===================== */
function openReview(){
  $('review-nota-label').textContent = 'Nota ' + session.nota;
  const list = $('review-list');
  list.innerHTML = '';
  session.points.forEach((p, idx)=>{
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
      if(confirm('Excluir o ponto ' + session.points[idx].ponto + '?')){
        session.points.splice(idx, 1);
        saveSession();
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

async function generatePdf(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const verdeEscuro = [11,61,35];
  const verde = [35,121,79];
  const vermelhoClaro = [247,193,193];
  const vermelhoTexto = [121,31,31];

  const logo = await loadLogoAsDataUrl();

  session.points.forEach((p, idx)=>{
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
    doc.text('Nota ' + session.nota, 28, y);
    doc.text('Ponto ' + p.ponto, 170, y);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(90,90,90);
    doc.text(p.photos[0].timeLabel, 280, y);

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
    doc.line(28, y+14, pageW-28, y+14);

    /* fotos */
    const photoTop = y + 34;
    const availW = pageW - 56;
    const maxPhotoH = 360;
    if(p.photos.length === 1){
      const img = p.photos[0];
      const dims = fitImage(availW, maxPhotoH, img.dataUrl);
      addPhotoWithFrame(doc, img, 28, photoTop, dims.w, dims.h);
      var afterPhotosY = photoTop + dims.h + 20;
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
    doc.text('Página ' + (idx+1) + ' de ' + session.points.length, pageW-28, pageH-10, {align:'right'});
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
  $('btn-generate-pdf').textContent = 'Gerando…';
  $('btn-generate-pdf').disabled = true;
  try{
    const doc = await generatePdf();
    window._lastPdf = doc;
    window._lastPdfName = `relatorio_nota_${session.nota}.pdf`;
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

function buildShareText(){
  const total = session.points.length;
  const foraDoPrumo = session.points.filter(p => p.photos.some(ph => ph.outOfLevel)).length;
  const hoje = formatTimestamp(new Date()).data;
  let txt = `Relatório fotográfico — Nota ${session.nota}\n`;
  txt += `${total} ponto${total===1?'':'s'} registrado${total===1?'':'s'} · ${hoje}`;
  if(foraDoPrumo > 0){
    txt += `\n⚠ ${foraDoPrumo} ponto${foraDoPrumo===1?'':'s'} fora do prumo`;
  }
  return txt;
}

$('btn-share-pdf').addEventListener('click', async ()=>{
  if(!window._lastPdf) return;
  const blob = window._lastPdf.output('blob');
  const file = new File([blob], window._lastPdfName, {type:'application/pdf'});
  const shareText = buildShareText();
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({ files:[file], title:'Relatório fotográfico — Nota ' + session.nota, text: shareText });
      return;
    }catch(e){ /* usuário cancelou ou falhou, cai no download */ }
  }
  window._lastPdf.save(window._lastPdfName);
  toast('Compartilhamento direto não disponível neste navegador — o PDF foi baixado.');
});

$('btn-new-session').addEventListener('click', ()=>{
  clearSession();
  showScreen('screen-start');
  initStartScreen();
});

/* ===================== Início ===================== */
initStartScreen();

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
