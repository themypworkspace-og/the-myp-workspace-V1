
// ═══════════════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════════════
let seconds = 7200, running = false, draftEnabled = false;
let _uploadedPDFDataURL = null; // base64 data URL of an uploaded PDF

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
              (navigator.userAgent.includes('Mac') && !navigator.userAgent.includes('Windows'));

// Keys for localStorage
const LS_DATA    = 'myp_workspace_data';
const LS_PDF     = 'myp_workspace_pdf';
const LS_PDF_SRC = 'myp_workspace_pdf_src';  // 'url' or 'upload'
const LS_DRAFT   = 'myp_draft_enabled';
const LS_TIMER   = 'myp_workspace_timer';
const LS_DIRTY   = 'myp_workspace_dirty';    // '1' if unsaved changes exist

// ═══════════════════════════════════════════════════════════
//  DOCUMENT READY
// ═══════════════════════════════════════════════════════════
$(document).ready(function() {
    $(".tool-window").draggable({ handle: ".tool-nav", containment: "window" }).resizable({ handles: "se" });

    // Snip paste zone focus
    const pz = document.getElementById('snip-paste-zone');
    pz.addEventListener('focus', () => { if(pz.innerText.trim() === pz.dataset.placeholder) { pz.innerText=''; pz.style.color='#333'; } });
    pz.addEventListener('blur',  () => { if(pz.innerText.trim() === '') { pz.innerText=pz.dataset.placeholder; pz.style.color='#999'; } });

    // MWS drop zone
    const dz = document.getElementById('mws-drop-zone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if(f) handleMWSUpload(f); });

    // PDF drop zone drag-and-drop
    const pdz = document.getElementById('pdf-drop-zone');
    pdz.addEventListener('dragover', e => { e.preventDefault(); pdz.classList.add('drag-over'); });
    pdz.addEventListener('dragleave', () => pdz.classList.remove('drag-over'));
    pdz.addEventListener('drop', e => { e.preventDefault(); pdz.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if(f && f.type==='application/pdf') handlePDFUpload(f); });

    // Global paste handler — fixes Mac image paste
    document.addEventListener('paste', function(e) {
        const target = e.target.closest('.ans-editable');
        if(!target) return;
        const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData) || {}).items;
        if(!items) return;
        let imageItem = null;
        for(let i = 0; i < items.length; i++) {
            if(items[i].type.startsWith('image/')) { imageItem = items[i]; break; }
        }
        if(imageItem) {
            e.preventDefault();
            const blob = imageItem.getAsFile();
            if(!blob) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const img = `<img src="${ev.target.result}" style="max-width:100%;border:1px solid #ccc;margin-top:8px;display:block;" alt="Pasted image">`;
                target.focus();
                const sel = window.getSelection();
                if(!sel.rangeCount) {
                    const range = document.createRange();
                    range.selectNodeContents(target);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                document.execCommand('insertHTML', false, img);
                saveWork();
            };
            reader.readAsDataURL(blob);
        }
    });

    // Check for recovery session
    checkRecovery();

    // Visitor counter
    fetch('https://api.countapi.xyz/get/themypworkspace/launches-v1')
        .then(r => r.json())
        .then(data => {
            const el = document.getElementById('visit-count');
            if(el && data.value != null) el.textContent = Number(data.value).toLocaleString();
        })
        .catch(() => {
            const el = document.getElementById('visit-count');
            if(el) el.textContent = '—';
        });
});

// ═══════════════════════════════════════════════════════════
//  RECOVERY — check for unsaved session on splash
// ═══════════════════════════════════════════════════════════
function checkRecovery() {
    const dirty   = localStorage.getItem(LS_DIRTY);
    const data    = localStorage.getItem(LS_DATA);
    const pdfSrc  = localStorage.getItem(LS_PDF);

    if(dirty === '1' && data) {
        const banner = document.getElementById('recovery-banner');
        banner.style.display = 'flex';
        let sub = 'You have unsaved work from a previous session.';
        if(pdfSrc) sub += ' Your past paper will also be restored.';
        document.getElementById('recovery-banner-sub').textContent = sub;
    }
}

function recoverSession() {
    document.getElementById('recovery-banner').style.display = 'none';
    const data   = localStorage.getItem(LS_DATA);
    const pdfSrc = localStorage.getItem(LS_PDF);
    const pdfSrcType = localStorage.getItem(LS_PDF_SRC);
    const timerSaved = parseInt(localStorage.getItem(LS_TIMER) || '0', 10);

    if(!data) return alert('No recoverable session found.');

    // Parse timer
    const timerVal = document.getElementById('timer-input').value.split(':');
    seconds = timerSaved > 0 ? timerSaved : (+timerVal[0]*3600 + +timerVal[1]*60 + +timerVal[2]);

    document.getElementById('splash-screen').style.display = 'none';

    // Restore PDF
    if(pdfSrc) {
        if(pdfSrcType === 'upload') {
            document.getElementById('pdf-frame').src = pdfSrc;
        } else {
            document.getElementById('pdf-frame').src = pdfSrc;
        }
        document.getElementById('pdf-url').value = (pdfSrcType !== 'upload') ? pdfSrc : '';
    }

    // Restore blocks
    $("#q-list").html(data);

    // Re-enable autosave if it was on
    if(localStorage.getItem(LS_DRAFT) === 'true') {
        draftEnabled = false; // toggleDraft will flip it
        toggleDraft();
    } else {
        // Always enable for recovery sessions
        draftEnabled = false;
        toggleDraft();
    }

    running = true;
    startClock();
    fetch('https://api.countapi.xyz/hit/themypworkspace/launches-v1').catch(()=>{});
}

function dismissRecovery() {
    document.getElementById('recovery-banner').style.display = 'none';
    // Clear old recovery data
    localStorage.removeItem(LS_DIRTY);
}

// ═══════════════════════════════════════════════════════════
//  PDF UPLOAD FROM COMPUTER
// ═══════════════════════════════════════════════════════════
function switchSource(which) {
    const urlRow  = document.getElementById('url-source-row');
    const dropZone= document.getElementById('pdf-drop-zone');
    const tabUrl  = document.getElementById('tab-url');
    const tabUp   = document.getElementById('tab-upload');

    if(which === 'url') {
        urlRow.style.display  = 'flex';
        dropZone.style.display= 'none';
        tabUrl.classList.add('active');
        tabUp.classList.remove('active');
        _uploadedPDFDataURL = null;
    } else {
        urlRow.style.display  = 'none';
        dropZone.style.display= 'block';
        tabUp.classList.add('active');
        tabUrl.classList.remove('active');
    }
}

function handlePDFUpload(file) {
    if(!file || file.type !== 'application/pdf') return;
    const reader = new FileReader();
    reader.onload = function(e) {
        _uploadedPDFDataURL = e.target.result;
        localStorage.setItem(LS_PDF, _uploadedPDFDataURL);
        localStorage.setItem(LS_PDF_SRC, 'upload');
        document.getElementById('pdf-frame').src = _uploadedPDFDataURL;
        document.getElementById('pdf-chosen-name').textContent = file.name;
        document.getElementById('pdf-drop-zone').classList.add('has-file');
    };
    reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════
function launch(restore) {
    let pdfSrc = '';
    let pdfSrcType = 'url';

    if(!restore) {
        const activeTab = document.getElementById('tab-upload').classList.contains('active');
        if(activeTab) {
            if(!_uploadedPDFDataURL) return alert("Please choose a PDF file to upload.");
            pdfSrc = _uploadedPDFDataURL;
            pdfSrcType = 'upload';
        } else {
            pdfSrc = document.getElementById('pdf-url').value.trim();
            if(!pdfSrc) return alert("Please enter a PDF link.");
            pdfSrcType = 'url';
        }
    }

    const t = document.getElementById('timer-input').value.split(':');
    seconds = (+t[0]*3600) + (+t[1]*60) + (+t[2]);

    if(restore) {
        $("#q-list").html(localStorage.getItem(LS_DATA));
        document.getElementById('pdf-frame').src = localStorage.getItem(LS_PDF) || "";
        if(localStorage.getItem(LS_DRAFT) === "true") toggleDraft();
    } else {
        $("#q-list").empty();
        document.getElementById('pdf-frame').src = pdfSrc;
        localStorage.setItem(LS_PDF, pdfSrc);
        localStorage.setItem(LS_PDF_SRC, pdfSrcType);
    }

    document.getElementById('splash-screen').style.display = 'none';
    running = true;
    startClock();

    // Always start autosave automatically when launching
    if(!draftEnabled) toggleDraft();

    fetch('https://api.countapi.xyz/hit/themypworkspace/launches-v1').catch(()=>{});
}

// ═══════════════════════════════════════════════════════════
//  AUTOSAVE / DRAFT
// ═══════════════════════════════════════════════════════════
let _autosaveTimer = null;

function toggleDraft() {
    draftEnabled = !draftEnabled;
    const btn = document.getElementById('draft-toggle');
    const dot = document.getElementById('autosave-dot');
    const lbl = document.getElementById('autosave-label-text');

    btn.textContent = draftEnabled ? "ON" : "OFF";
    dot.className = 'autosave-dot' + (draftEnabled ? ' on' : '');
    lbl.textContent = draftEnabled ? 'Autosave On' : 'Autosave Off';
    localStorage.setItem(LS_DRAFT, draftEnabled);

    if(draftEnabled) {
        saveWork();
        // Periodic autosave every 30s
        clearInterval(_autosaveTimer);
        _autosaveTimer = setInterval(saveWork, 30000);
    } else {
        clearInterval(_autosaveTimer);
    }
}

function saveWork() {
    if(!draftEnabled) return;
    const dot = document.getElementById('autosave-dot');
    dot.className = 'autosave-dot saving';

    localStorage.setItem(LS_DATA, $("#q-list").html());
    localStorage.setItem(LS_TIMER, seconds.toString());
    localStorage.setItem(LS_DIRTY, '1');

    setTimeout(() => {
        dot.className = 'autosave-dot on';
    }, 400);
}

// Mark as clean when user explicitly saves
function markClean() {
    localStorage.setItem(LS_DIRTY, '0');
}

// ═══════════════════════════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════════════════════════
function startClock() {
    setInterval(() => {
        if(running && seconds > 0) {
            seconds--;
            const h = Math.floor(seconds/3600).toString().padStart(2,'0');
            const m = Math.floor((seconds%3600)/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            const el = document.getElementById('timer-txt');
            el.innerText = `${h}:${m}:${s}`;
            // Color changes
            if(seconds <= 300) el.className = 'timer-display critical';
            else if(seconds <= 900) el.className = 'timer-display warning';
            else el.className = 'timer-display';
            // Autosave timer periodically
            if(draftEnabled && seconds % 30 === 0) {
                localStorage.setItem(LS_TIMER, seconds.toString());
            }
        } else if(running && seconds === 0) {
            running = false;
            document.getElementById('p-btn').innerText = "Resume";
            document.getElementById('p-btn').className = 'h-btn';
            document.getElementById('p-btn').style.background = '#28a745';
            document.getElementById('timesup-overlay').style.display = 'flex';
        }
    }, 1000);
}

function continueSession() {
    document.getElementById('timesup-overlay').style.display = 'none';
    seconds = 1800; running = true;
    document.getElementById('p-btn').innerText = "Pause";
    document.getElementById('p-btn').className = 'h-btn h-btn-danger';
    document.getElementById('p-btn').style.background = '';
}

function toggleTimer() {
    running = !running;
    const btn = document.getElementById('p-btn');
    if(running) {
        btn.innerText = "Pause";
        btn.className = 'h-btn h-btn-danger';
        btn.style.background = '';
    } else {
        btn.innerText = "Resume";
        btn.className = 'h-btn';
        btn.style.background = '#28a745';
    }
}

function toggleLR() {
    const c = document.getElementById('layout-box');
    c.style.flexDirection = (c.style.flexDirection === 'row-reverse') ? 'row' : 'row-reverse';
}

// ═══════════════════════════════════════════════════════════
//  DRAWING TOOL
// ═══════════════════════════════════════════════════════════
let _drawingToolLoaded = false;
let _drawingBlobURL = null;

function _prewarmDrawingTool() {
    if(_drawingBlobURL) return;
    try {
        const blob = new Blob([getDrawingToolSrc()], { type: 'text/html' });
        _drawingBlobURL = URL.createObjectURL(blob);
    } catch(e) {}
}
setTimeout(_prewarmDrawingTool, 3000);

function switchDrawTab(which) {
    const polyPane   = document.getElementById('draw-pane-polypad');
    const myPane     = document.getElementById('draw-pane-mydraw');
    const btnPoly    = document.getElementById('draw-tab-polypad');
    const btnMy      = document.getElementById('draw-tab-mydraw');
    const insPolypad = document.getElementById('draw-insert-polypad');
    const insMydraw  = document.getElementById('draw-insert-mydraw');

    if(which === 'polypad') {
        polyPane.style.display = 'block'; myPane.style.display = 'none';
        btnPoly.style.background = 'rgba(255,255,255,0.25)'; btnPoly.style.color = 'white';
        btnMy.style.background = 'transparent'; btnMy.style.color = 'rgba(255,255,255,0.7)';
        insPolypad.style.display = 'inline-block'; insMydraw.style.display = 'none';
    } else {
        polyPane.style.display = 'none'; myPane.style.display = 'block';
        btnMy.style.background = 'rgba(255,255,255,0.25)'; btnMy.style.color = 'white';
        btnPoly.style.background = 'transparent'; btnPoly.style.color = 'rgba(255,255,255,0.7)';
        insPolypad.style.display = 'none'; insMydraw.style.display = 'inline-block';
        if(!_drawingToolLoaded) loadDrawingTool();
    }
}

function loadDrawingTool() {
    _drawingToolLoaded = true;
    const placeholder = document.getElementById('mydraw-placeholder');
    const iframe = document.getElementById('mydraw-iframe');
    const url = _drawingBlobURL || (() => {
        const blob = new Blob([getDrawingToolSrc()], { type: 'text/html' });
        return URL.createObjectURL(blob);
    })();
    iframe.src = url;
    iframe.onload = () => { if(placeholder) placeholder.style.display = 'none'; };
}

window.addEventListener('message', function(e) {
    if(!e.data || e.data.type !== 'myp-drawing-insert') return;
    const dataURL = e.data.dataURL;
    if(!dataURL) return;
    const sel = document.getElementById('draw-target');
    const targetId = sel ? sel.value : '';
    if(!targetId) { alert('Please select an answer box in the Drawing Tool insert bar first.'); return; }
    const editable = document.querySelector(`#${targetId} .ans-editable`);
    if(!editable) return;
    const img = `<img src="${dataURL}" style="max-width:100%;border:1px solid #ccc;margin-top:8px;display:block;" alt="Drawing">`;
    editable.focus();
    document.execCommand('insertHTML', false, img);
    saveWork();
    const status = document.getElementById('draw-status');
    if(status) { status.style.display='inline'; status.textContent='✔ Drawing Inserted!'; setTimeout(()=>status.style.display='none', 2500); }
});

function triggerDrawingToolInsert() {
    const iframe = document.getElementById('mydraw-iframe');
    if(iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'myp-request-insert' }, '*');
}

// ═══════════════════════════════════════════════════════════
//  DRAWING TOOL SOURCE (unchanged from original)
// ═══════════════════════════════════════════════════════════
function getDrawingToolSrc() {
return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>MYP Drawing Tool<\/title>\n\n<style>\n:root{--bg:#1a1d23;--panel:#22262e;--panel2:#2a2f3a;--border:#363c4a;\n  --blue:#3b9eff;--bd:#1e4f7a;--green:#3ddc84;--red:#ff5f57;--text:#e8eaf0;--muted:#7a8499;}\n*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}\nbody{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:var(--bg);color:var(--text);height:100vh;\n  display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased;}\n\n/* TOPBAR */\n#tb{height:46px;background:var(--panel);border-bottom:1px solid var(--border);display:flex;\n  align-items:center;padding:0 10px;gap:2px;flex-shrink:0;z-index:50;}\n.brand{font-size:13px;font-weight:700;color:var(--blue);margin-right:6px;white-space:nowrap;}\n.sp{width:1px;height:22px;background:var(--border);margin:0 4px;flex-shrink:0;}\n.tsp{flex:1;}\n.b{height:28px;padding:0 8px;border:1px solid transparent;border-radius:5px;background:transparent;\n  color:var(--muted);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:500;cursor:pointer;\n  display:flex;align-items:center;gap:3px;transition:all .12s;white-space:nowrap;flex-shrink:0;}\n.b:hover{background:var(--panel2);color:var(--text);border-color:var(--border);}\n.b.active{background:var(--bd);color:var(--blue);border-color:var(--blue);}\n#ins-btn{height:28px;padding:0 12px;border:none;border-radius:5px;\n  background:linear-gradient(135deg,#28a745,#20c060);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;\n  font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:opacity .12s;}\n#ins-btn:hover{opacity:.85;}\n\n/* BODY */\n#body{display:flex;flex:1;overflow:hidden;}\n\n/* SIDEBAR */\n#sb{width:190px;background:var(--panel);border-right:1px solid var(--border);\n  display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;}\n#tabs{display:flex;background:var(--panel2);border-bottom:1px solid var(--border);flex-shrink:0;}\n.tab{flex:1;padding:6px 2px;border:none;background:transparent;color:var(--muted);\n  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:600;cursor:pointer;\n  border-bottom:2px solid transparent;transition:all .12s;text-align:center;}\n.tab:hover{color:var(--text);}\n.tab.on{color:var(--blue);border-bottom-color:var(--blue);}\n.tp{display:none;flex-direction:column;overflow-y:auto;flex:1;}\n.tp.on{display:flex;}\n.tp::-webkit-scrollbar{width:3px;}\n.tp::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}\n.sec{padding:8px 9px 10px;border-bottom:1px solid var(--border);}\n.sec:last-child{border-bottom:none;}\n.st{font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:7px;}\n.tg{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;}\n.tool{aspect-ratio:1;background:var(--panel2);border:1px solid var(--border);border-radius:5px;\n  font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;\n  transition:all .12s;position:relative;user-select:none;}\n.tool:hover{border-color:var(--blue);background:#1e3a54;}\n.tool.on{border-color:var(--blue);background:var(--bd);box-shadow:0 0 0 2px rgba(59,158,255,.2);}\n.tool[title]:hover::after{content:attr(title);position:absolute;left:calc(100% + 5px);top:50%;\n  transform:translateY(-50%);background:#111;color:#fff;font-size:9px;padding:2px 5px;\n  border-radius:3px;white-space:nowrap;z-index:999;pointer-events:none;}\n.sw-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-bottom:5px;}\n.sw{aspect-ratio:1;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform .12s,border-color .12s;}\n.sw:hover{transform:scale(1.18);}\n.sw.on{border-color:#fff;transform:scale(1.1);}\n.crow{display:flex;align-items:center;gap:5px;margin-top:3px;}\n.crow label{font-size:9px;color:var(--muted);flex:1;}\n.crow input[type=color]{width:24px;height:20px;border:1px solid var(--border);border-radius:3px;cursor:pointer;padding:1px;background:var(--panel2);}\n.sr{display:flex;align-items:center;gap:5px;margin-bottom:5px;}\n.sr label{font-size:9px;color:var(--muted);width:44px;flex-shrink:0;}\n.sr input[type=range]{flex:1;height:3px;accent-color:var(--blue);cursor:pointer;}\n.sv{font-size:9px;font-family:'Courier New',Courier,monospace;color:var(--blue);width:20px;text-align:right;flex-shrink:0;}\n.mr{display:flex;gap:3px;flex-wrap:wrap;}\n.mb{flex:1;min-width:26px;padding:4px 2px;background:var(--panel2);border:1px solid var(--border);\n  border-radius:4px;color:var(--muted);font-size:9px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;\n  cursor:pointer;text-align:center;transition:all .12s;}\n.mb:hover{color:var(--text);border-color:var(--blue);}\n.mb.on{background:var(--bd);color:var(--blue);border-color:var(--blue);}\n.fb{width:100%;padding:6px;background:var(--blue);border:none;border-radius:5px;color:#fff;\n  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:600;cursor:pointer;transition:background .12s;margin-top:3px;}\n.fb:hover{background:#5aacff;}\n.fb.danger{background:#7a1515;} .fb.danger:hover{background:#c0392b;}\n.rp{display:flex;gap:3px;margin-bottom:4px;}\n.rp input{flex:1;width:0;background:var(--panel2);border:1px solid var(--border);border-radius:4px;\n  padding:3px 5px;color:var(--text);font-family:'Courier New',Courier,monospace;font-size:10px;outline:none;}\n.rp input:focus{border-color:var(--blue);}\n.fnrow{display:flex;align-items:center;gap:3px;margin-bottom:4px;}\n.fdot{width:9px;height:9px;border-radius:50%;flex-shrink:0;cursor:pointer;}\n.finp{flex:1;background:var(--panel2);border:1px solid var(--border);border-radius:4px;\n  padding:4px 5px;color:var(--text);font-family:'Courier New',Courier,monospace;font-size:10px;outline:none;}\n.finp:focus{border-color:var(--blue);}\n.fdel{width:17px;height:17px;background:#3a1a1a;border:none;border-radius:3px;color:var(--red);\n  font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}\n.fdel:hover{background:#5a2020;}\n\n/* CANVAS */\n#cw{flex:1;position:relative;overflow:hidden;\n  background:radial-gradient(circle,#c8d3e0 1px,transparent 1px) 0 0/20px 20px,#e8edf3;}\n#dc,#gc,#ac,#uc{position:absolute;inset:0;width:100%;height:100%;}\n#dc{z-index:1;}#gc{z-index:2;pointer-events:none;}#ac{z-index:3;pointer-events:none;}#uc{z-index:4;}\n#to{position:absolute;display:none;z-index:60;}\n#ti{border:2px dashed var(--blue);background:rgba(255,255,255,.95);color:#111;\n  padding:3px 7px;outline:none;border-radius:4px;min-width:90px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;}\n\n/* STATUS */\n#sbar{height:22px;background:var(--panel);border-top:1px solid var(--border);display:flex;\n  align-items:center;padding:0 10px;gap:12px;font-size:9px;color:var(--muted);\n  font-family:'Courier New',Courier,monospace;flex-shrink:0;}\n.sdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:3px;\n  vertical-align:middle;border:1px solid rgba(255,255,255,.2);}\n<\/style>\n<\/head>\n<body>\n\n<div id=\"tb\">\n  <span class=\"brand\">\u270f\ufe0f MYP Drawing Tool<\/span>\n  <div class=\"sp\"><\/div>\n  <button class=\"b\" onclick=\"newCanvas()\">New<\/button>\n  <button class=\"b\" onclick=\"saveAsPNG()\">\ud83d\udcbe PNG<\/button>\n  <button class=\"b\" onclick=\"copyImg()\" id=\"copybtn\">\ud83d\udccb Copy<\/button>\n  <div class=\"sp\"><\/div>\n  <button class=\"b\" onclick=\"undo()\">\u21a9 Undo<\/button>\n  <button class=\"b\" onclick=\"redo()\">\u21aa Redo<\/button>\n  <button class=\"b\" onclick=\"clearAll()\">\ud83d\uddd1 Clear<\/button>\n  <div class=\"sp\"><\/div>\n  <button class=\"b\" id=\"gridbtn\" onclick=\"toggleGrid()\">\u229e Grid<\/button>\n  <button class=\"b\" id=\"snapbtn\" onclick=\"toggleSnap()\">\ud83e\uddf2 Snap<\/button>\n  <button class=\"b\" id=\"rulerbtn\" onclick=\"toggleRuler()\">\ud83d\udcd0 Ruler<\/button>\n  <div class=\"tsp\"><\/div>\n  <button class=\"b\" onclick=\"doZoom(-.15)\">\u2212<\/button>\n  <span id=\"zlbl\" style=\"font-size:10px;color:var(--muted);font-family:'Courier New',Courier,monospace;min-width:32px;text-align:center;\">100%<\/span>\n  <button class=\"b\" onclick=\"doZoom(+.15)\">+<\/button>\n  <button class=\"b\" onclick=\"resetZoom()\">\u2299<\/button>\n  <div class=\"sp\"><\/div>\n  <button id=\"ins-btn\" onclick=\"insertToQuestion()\">\u2795 Insert into Question<\/button>\n<\/div>\n\n<div id=\"body\">\n<div id=\"sb\">\n  <div id=\"tabs\">\n    <button class=\"tab on\" onclick=\"showTab('tools')\">Tools<\/button>\n    <button class=\"tab\"    onclick=\"showTab('style')\">Style<\/button>\n    <button class=\"tab\"    onclick=\"showTab('graph')\">Graph<\/button>\n    <button class=\"tab\"    onclick=\"showTab('axis')\">Axis<\/button>\n  <\/div>\n\n  <!-- TOOLS TAB -->\n  <div class=\"tp on\" id=\"tp-tools\">\n    <div class=\"sec\">\n      <div class=\"st\">Draw<\/div>\n      <div class=\"tg\">\n        <div class=\"tool on\" id=\"t-pen\"     onclick=\"setTool('pen')\"     title=\"Pen (P)\">\u270f\ufe0f<\/div>\n        <div class=\"tool\"    id=\"t-eraser\"  onclick=\"setTool('eraser')\"  title=\"Eraser (E)\">\ud83e\uddf9<\/div>\n        <div class=\"tool\"    id=\"t-line\"    onclick=\"setTool('line')\"    title=\"Line (L)\">\u2571<\/div>\n        <div class=\"tool\"    id=\"t-arrow\"   onclick=\"setTool('arrow')\"   title=\"Arrow (A)\">\u279c<\/div>\n        <div class=\"tool\"    id=\"t-dbarrow\" onclick=\"setTool('dbarrow')\" title=\"Double Arrow\">\u27fa<\/div>\n        <div class=\"tool\"    id=\"t-text\"    onclick=\"setTool('text')\"    title=\"Text (T)\">T<\/div>\n      <\/div>\n    <\/div>\n    <div class=\"sec\">\n      <div class=\"st\">Shapes<\/div>\n      <div class=\"tg\">\n        <div class=\"tool\" id=\"t-rect\"        onclick=\"setTool('rect')\"        title=\"Rectangle (R)\">\u25ad<\/div>\n        <div class=\"tool\" id=\"t-circle\"      onclick=\"setTool('circle')\"      title=\"Ellipse (C)\">\u25cb<\/div>\n        <div class=\"tool\" id=\"t-triangle\"    onclick=\"setTool('triangle')\"    title=\"Triangle\">\u25b3<\/div>\n        <div class=\"tool\" id=\"t-rtri\"        onclick=\"setTool('rtri')\"        title=\"Right Triangle\">\u25fa<\/div>\n        <div class=\"tool\" id=\"t-diamond\"     onclick=\"setTool('diamond')\"     title=\"Diamond\">\u25c7<\/div>\n        <div class=\"tool\" id=\"t-star\"        onclick=\"setTool('star')\"        title=\"Star\">\u2605<\/div>\n        <div class=\"tool\" id=\"t-hexagon\"     onclick=\"setTool('hexagon')\"     title=\"Hexagon\">\u2b21<\/div>\n        <div class=\"tool\" id=\"t-pentagon\"    onclick=\"setTool('pentagon')\"    title=\"Pentagon\">\u2b20<\/div>\n        <div class=\"tool\" id=\"t-parallelogram\" onclick=\"setTool('parallelogram')\" title=\"Parallelogram\">\u25b1<\/div>\n        <div class=\"tool\" id=\"t-trapezoid\"   onclick=\"setTool('trapezoid')\"   title=\"Trapezoid\">\u23e2<\/div>\n        <div class=\"tool\" id=\"t-cloud\"       onclick=\"setTool('cloud')\"       title=\"Cloud\">\u2601<\/div>\n        <div class=\"tool\" id=\"t-cross\"       onclick=\"setTool('cross')\"       title=\"Cross\">\u271a<\/div>\n      <\/div>\n    <\/div>\n    <div class=\"sec\" id=\"txt-opts\" style=\"display:none;\">\n      <div class=\"st\">Text<\/div>\n      <div class=\"sr\"><label>Size<\/label>\n        <input type=\"range\" id=\"tszsl\" min=\"8\" max=\"72\" value=\"18\" oninput=\"setTxtSize(+this.value)\">\n        <span class=\"sv\" id=\"tszv\">18<\/span><\/div>\n      <div class=\"mr\">\n        <button class=\"mb on\" id=\"ts-n\" onclick=\"setTxtStyle('normal')\">Aa<\/button>\n        <button class=\"mb\"    id=\"ts-b\" onclick=\"setTxtStyle('bold')\"><b>B<\/b><\/button>\n        <button class=\"mb\"    id=\"ts-i\" onclick=\"setTxtStyle('italic')\"><i>I<\/i><\/button>\n      <\/div>\n    <\/div>\n  <\/div>\n\n  <!-- STYLE TAB -->\n  <div class=\"tp\" id=\"tp-style\">\n    <div class=\"sec\">\n      <div class=\"st\">Stroke Color<\/div>\n      <div class=\"sw-grid\" id=\"sw-stroke\"><\/div>\n      <div class=\"crow\"><label>Custom<\/label>\n        <input type=\"color\" id=\"cstroke\" value=\"#1a1d23\" onchange=\"setStroke(this.value)\">\n        <span id=\"shex\" style=\"font-size:9px;font-family:'Courier New',Courier,monospace;color:var(--muted);\">#1a1d23<\/span>\n      <\/div>\n    <\/div>\n    <div class=\"sec\">\n      <div class=\"st\">Fill<\/div>\n      <div class=\"mr\" style=\"margin-bottom:5px;\">\n        <button class=\"mb on\" id=\"fill-none\"  onclick=\"setFillMode('none')\">None<\/button>\n        <button class=\"mb\"    id=\"fill-solid\" onclick=\"setFillMode('solid')\">Solid<\/button>\n      <\/div>\n      <div class=\"sw-grid\" id=\"sw-fill\"><\/div>\n      <div class=\"crow\"><label>Custom<\/label>\n        <input type=\"color\" id=\"cfill\" value=\"#e8f4ff\" onchange=\"setFillCol(this.value)\">\n      <\/div>\n    <\/div>\n    <div class=\"sec\">\n      <div class=\"st\">Stroke Style<\/div>\n      <div class=\"sr\"><label>Width<\/label>\n        <input type=\"range\" id=\"szsl\" min=\"1\" max=\"50\" value=\"2\" oninput=\"setSize(+this.value)\">\n        <span class=\"sv\" id=\"szv\">2<\/span><\/div>\n      <div class=\"sr\"><label>Opacity<\/label>\n        <input type=\"range\" id=\"opsl\" min=\"5\" max=\"100\" value=\"100\" oninput=\"setOpacity(+this.value)\">\n        <span class=\"sv\" id=\"opv\">100<\/span><\/div>\n      <div class=\"mr\">\n        <button class=\"mb on\" id=\"ls-solid\"  onclick=\"setLS('solid')\">\u2014<\/button>\n        <button class=\"mb\"    id=\"ls-dashed\" onclick=\"setLS('dashed')\">\u2013 \u2013<\/button>\n        <button class=\"mb\"    id=\"ls-dotted\" onclick=\"setLS('dotted')\">\u00b7 \u00b7 \u00b7<\/button>\n      <\/div>\n    <\/div>\n  <\/div>\n\n  <!-- GRAPH TAB -->\n  <div class=\"tp\" id=\"tp-graph\">\n    <div class=\"sec\">\n      <div class=\"st\">Functions<\/div>\n      <div id=\"fnlist\"><\/div>\n      <button class=\"mb\" style=\"width:100%;margin-bottom:5px;\" onclick=\"addFn()\">+ Add Function<\/button>\n      <button class=\"fb\" onclick=\"plotGraph()\">\ud83d\udcc8 Plot<\/button>\n      <button class=\"fb danger\" onclick=\"clearGraph()\" style=\"margin-top:3px;\">\u2715 Clear<\/button>\n    <\/div>\n    <div class=\"sec\">\n      <div class=\"st\">Axis Range<\/div>\n      <div style=\"display:flex;gap:4px;align-items:center;margin-bottom:4px;\">\n        <span style=\"font-size:9px;color:var(--muted);width:10px;\">x<\/span>\n        <div class=\"rp\" style=\"flex:1;margin:0;\">\n          <input type=\"number\" id=\"xmin\" value=\"-10\" placeholder=\"min\">\n          <input type=\"number\" id=\"xmax\" value=\"10\" placeholder=\"max\">\n        <\/div>\n      <\/div>\n      <div style=\"display:flex;gap:4px;align-items:center;margin-bottom:6px;\">\n        <span style=\"font-size:9px;color:var(--muted);width:10px;\">y<\/span>\n        <div class=\"rp\" style=\"flex:1;margin:0;\">\n          <input type=\"number\" id=\"ymin\" value=\"-10\" placeholder=\"min\">\n          <input type=\"number\" id=\"ymax\" value=\"10\" placeholder=\"max\">\n        <\/div>\n      <\/div>\n      <div class=\"mr\">\n        <button class=\"mb\" onclick=\"zoomInG()\">Zoom+<\/button>\n        <button class=\"mb\" onclick=\"zoomOutG()\">Zoom\u2212<\/button>\n        <button class=\"mb\" onclick=\"resetGV()\">Reset<\/button>\n      <\/div>\n    <\/div>\n  <\/div>\n\n  <!-- AXIS TAB -->\n  <div class=\"tp\" id=\"tp-axis\">\n    <div class=\"sec\">\n      <div class=\"st\">Axis Direction<\/div>\n      <div class=\"mr\" style=\"margin-bottom:6px;\">\n        <button class=\"mb on\" id=\"ax-x\"  onclick=\"setAxDir('x')\">\u2192 x<\/button>\n        <button class=\"mb\"    id=\"ax-y\"  onclick=\"setAxDir('y')\">\u2191 y<\/button>\n        <button class=\"mb\"    id=\"ax-xy\" onclick=\"setAxDir('xy')\">\u2295 Both<\/button>\n      <\/div>\n      <button class=\"fb\" onclick=\"setTool('axis')\" id=\"t-axis\">\ud83d\udd8a Draw Axis on Canvas<\/button>\n    <\/div>\n    <div class=\"sec\">\n      <div class=\"st\">Scale &amp; Labels<\/div>\n      <div class=\"sr\"><label>Step<\/label>\n        <input type=\"range\" id=\"axstep\" min=\"1\" max=\"20\" value=\"1\"\n               oninput=\"axStep=+this.value;document.getElementById('axstepv').textContent=this.value\">\n        <span class=\"sv\" id=\"axstepv\">1<\/span><\/div>\n      <div class=\"sr\"><label>Start at<\/label>\n        <input type=\"range\" id=\"axstart\" min=\"-20\" max=\"0\" value=\"0\"\n               oninput=\"axStart=+this.value;document.getElementById('axstartv').textContent=this.value\">\n        <span class=\"sv\" id=\"axstartv\">0<\/span><\/div>\n      <div class=\"mr\">\n        <button class=\"mb on\" id=\"lbl-y\" onclick=\"setAxLbls(true)\">Labels \u2713<\/button>\n        <button class=\"mb\"    id=\"lbl-n\" onclick=\"setAxLbls(false)\">Labels \u2717<\/button>\n      <\/div>\n    <\/div>\n    <div class=\"sec\">\n      <div class=\"st\">Origin Style<\/div>\n      <div class=\"mr\" style=\"margin-bottom:5px;\">\n        <button class=\"mb on\" id=\"org-zero\"   onclick=\"setOrigStyle('zero')\">0<\/button>\n        <button class=\"mb\"    id=\"org-wiggle\" onclick=\"setOrigStyle('wiggle')\">\u3030 Break<\/button>\n        <button class=\"mb\"    id=\"org-none\"   onclick=\"setOrigStyle('none')\">None<\/button>\n      <\/div>\n      <div class=\"sr\"><label>Tick sz<\/label>\n        <input type=\"range\" id=\"ticksz\" min=\"3\" max=\"20\" value=\"8\"\n               oninput=\"axTickSz=+this.value;document.getElementById('tickszv').textContent=this.value\">\n        <span class=\"sv\" id=\"tickszv\">8<\/span><\/div>\n    <\/div>\n    <div class=\"sec\">\n      <div class=\"st\">Axis Color<\/div>\n      <div class=\"sw-grid\" id=\"sw-axis\"><\/div>\n      <div class=\"crow\"><label>Custom<\/label>\n        <input type=\"color\" id=\"caxis\" value=\"#1a1d23\" onchange=\"axColor=this.value;\">\n      <\/div>\n    <\/div>\n    <div class=\"sec\">\n      <button class=\"fb danger\" onclick=\"clearAxes()\" style=\"margin-top:0;\">\u2715 Clear All Axes<\/button>\n    <\/div>\n  <\/div>\n<\/div><!-- /sb -->\n\n<div id=\"cw\">\n  <canvas id=\"dc\"><\/canvas>\n  <canvas id=\"gc\"><\/canvas>\n  <canvas id=\"ac\"><\/canvas>\n  <canvas id=\"uc\"><\/canvas>\n  <div id=\"to\"><input id=\"ti\" type=\"text\" placeholder=\"Type\u2026\" onkeydown=\"commitTxt(event)\"><\/div>\n<\/div>\n<\/div><!-- /body -->\n\n<div id=\"sbar\">\n  <span id=\"st-tool\">Pen<\/span>\n  <span id=\"st-pos\">0 , 0<\/span>\n  <span><span class=\"sdot\" id=\"scdot\" style=\"background:#1a1d23;\"><\/span><span id=\"schex\">#1a1d23<\/span><\/span>\n  <span id=\"stsz\">2 px<\/span>\n  <span id=\"stmsg\" style=\"color:var(--green);margin-left:auto;\"><\/span>\n<\/div>\n\n<script>\nconst dC=document.getElementById('dc'),gC=document.getElementById('gc');\nconst aC=document.getElementById('ac'),uC=document.getElementById('uc');\nconst dX=dC.getContext('2d'),gX=gC.getContext('2d'),aX=aC.getContext('2d'),uX=uC.getContext('2d');\n\nlet tool='pen',strokeCol='#1a1d23',fillCol='rgba(59,158,255,0.12)',fillMode='none';\nlet sz=2,op=1,ls='solid',txtSize=18,txtStyle='normal';\nlet drawing=false,sx=0,sy=0,snapOn=false,showRuler=false,zoomLvl=1,showGrid=false;\nlet history=[],redoStack=[],txtPos={x:0,y:0};\nconst SNAP=15;\nlet axDir='x',axStep=1,axStart=0,axLabels=true,axOrigStyle='zero',axTickSz=8,axColor='#1a1d23';\nlet axesDrawn=[];\nlet fns=[],fnCols=['#e74c3c','#3b9eff','#3ddc84','#f5a623','#b983ff','#ff6ec7','#00cfc1'],fnCI=0;\n\nconst SCOLS=['#1a1d23','#e74c3c','#3b9eff','#3ddc84','#f5a623','#b983ff','#ff6ec7','#00cfc1','#ff8c42','#ffffff'];\nconst FCOLS=['rgba(231,76,60,.15)','rgba(59,158,255,.12)','rgba(61,220,132,.12)','rgba(245,166,35,.15)','rgba(185,131,255,.12)','rgba(0,207,193,.12)','rgba(255,255,255,.7)','rgba(200,210,230,.3)'];\nconst AXCOLS=['#1a1d23','#444','#888','#e74c3c','#3b9eff','#3ddc84'];\n\nfunction init(){\n  resize();\n  window.addEventListener('resize',()=>{resize();redrawAll();});\n  buildAllSwatches();\n  addFn();addFn();\n  requestAnimationFrame(()=>saveHist());\n}\n\nfunction resize(){\n  const wr=document.getElementById('cw'),w=wr.clientWidth,h=wr.clientHeight;\n  [dC,gC,aC,uC].forEach(c=>{c.width=w;c.height=h;});\n}\n\nfunction redrawAll(){\n  if(history.length)dX.putImageData(history[history.length-1],0,0);\n  redrawAxes();\n}\n\nfunction showTab(id){\n  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('on',['tools','style','graph','axis'][i]===id));\n  document.querySelectorAll('.tp').forEach(p=>p.classList.remove('on'));\n  document.getElementById('tp-'+id).classList.add('on');\n}\n\nfunction setTool(t){\n  tool=t;\n  document.querySelectorAll('.tool').forEach(b=>b.classList.remove('on'));\n  const btn=document.getElementById('t-'+t);if(btn)btn.classList.add('on');\n  document.getElementById('txt-opts').style.display=t==='text'?'block':'none';\n  if(t==='axis'){showTab('axis');document.getElementById('t-axis').style.background='#1e4f7a';}\n  else{document.getElementById('t-axis').style.background='';}\n  uC.style.cursor=t==='text'?'text':t==='eraser'?'cell':'crosshair';\n  document.getElementById('st-tool').textContent=t.charAt(0).toUpperCase()+t.slice(1);\n}\n\nfunction setStroke(c){\n  strokeCol=c;\n  document.querySelectorAll('#sw-stroke .sw').forEach((s,i)=>s.classList.toggle('on',SCOLS[i]===c));\n  document.getElementById('cstroke').value=c.startsWith('#')&&c.length===7?c:'#000000';\n  document.getElementById('shex').textContent=c;\n  document.getElementById('scdot').style.background=c;\n  document.getElementById('schex').textContent=c;\n}\nfunction setFillCol(c){fillCol=c;}\nfunction setFillMode(m){fillMode=m;document.getElementById('fill-none').classList.toggle('on',m==='none');document.getElementById('fill-solid').classList.toggle('on',m==='solid');}\nfunction setSize(s){sz=s;document.getElementById('szv').textContent=s;document.getElementById('stsz').textContent=s+' px';}\nfunction setOpacity(o){op=o/100;document.getElementById('opv').textContent=o;}\nfunction setLS(s){ls=s;['solid','dashed','dotted'].forEach(x=>document.getElementById('ls-'+x).classList.toggle('on',x===s));}\nfunction setTxtSize(s){txtSize=s;document.getElementById('tszv').textContent=s;}\nfunction setTxtStyle(s){txtStyle=s;['n','b','i'].forEach(x=>document.getElementById('ts-'+x).classList.toggle('on',['normal','bold','italic'][['n','b','i'].indexOf(x)]===s));}\nfunction setAxDir(d){axDir=d;['x','y','xy'].forEach(x=>document.getElementById('ax-'+x).classList.toggle('on',x===d));}\nfunction setAxLbls(v){axLabels=v;document.getElementById('lbl-y').classList.toggle('on',v);document.getElementById('lbl-n').classList.toggle('on',!v);}\nfunction setOrigStyle(s){axOrigStyle=s;['zero','wiggle','none'].forEach(x=>document.getElementById('org-'+x).classList.toggle('on',x===s));}\n\nfunction buildAllSwatches(){\n  bsw('sw-stroke',SCOLS,setStroke,strokeCol,false);\n  bsw('sw-fill',FCOLS,setFillCol,null,true);\n  bsw('sw-axis',AXCOLS,c=>{axColor=c;},axColor,false);\n}\nfunction bsw(id,cols,fn,active,isFill){\n  const el=document.getElementById(id);el.innerHTML='';\n  cols.forEach(c=>{\n    const d=document.createElement('div');\n    d.className='sw'+(c===active?' on':'');\n    d.style.background=c;\n    if(c==='#ffffff')d.style.border='2px solid #555';\n    if(isFill)d.style.border='2px solid rgba(255,255,255,.15)';\n    d.onclick=()=>fn(c);\n    el.appendChild(d);\n  });\n}\n\nuC.addEventListener('mousedown',e=>onDown(e));\nuC.addEventListener('mousemove',e=>onMove(e));\nuC.addEventListener('mouseup',e=>onUp(e));\nuC.addEventListener('mouseleave',e=>onUp(e));\nuC.addEventListener('touchstart',e=>{e.preventDefault();onDown(toM(e));},{passive:false});\nuC.addEventListener('touchmove',e=>{e.preventDefault();onMove(toM(e));},{passive:false});\nuC.addEventListener('touchend',e=>{e.preventDefault();onUp(toM(e));},{passive:false});\nfunction toM(e){const t=e.touches[0]||e.changedTouches[0];return{clientX:t.clientX,clientY:t.clientY};}\nfunction getXY(e){\n  const r=uC.getBoundingClientRect();\n  let x=(e.clientX-r.left)/zoomLvl,y=(e.clientY-r.top)/zoomLvl;\n  if(snapOn){x=Math.round(x/SNAP)*SNAP;y=Math.round(y/SNAP)*SNAP;}\n  return[x,y];\n}\nfunction onDown(e){const[x,y]=getXY(e);if(tool==='text'){showTxtInput(x,y);return;}drawing=true;sx=x;sy=y;if(tool==='pen'||tool==='eraser'){applyStyle(dX);dX.beginPath();dX.moveTo(x,y);}}\nfunction onMove(e){\n  const[x,y]=getXY(e);\n  document.getElementById('st-pos').textContent=`${Math.round(x)} , ${Math.round(y)}`;\n  if(showRuler)drawRulerLines(x,y);\n  if(!drawing)return;\n  if(tool==='pen'||tool==='eraser'){applyStyle(dX);dX.lineTo(x,y);dX.stroke();}\n  else{uX.clearRect(0,0,uC.width,uC.height);drawShape(uX,tool,sx,sy,x,y);if(showRuler)drawRulerLines(x,y);}\n}\nfunction onUp(e){\n  if(!drawing)return;drawing=false;\n  const[x,y]=getXY(e);\n  if(tool!=='pen'&&tool!=='eraser'){\n    if(tool==='axis')commitAxis(sx,sy,x,y);\n    else drawShape(dX,tool,sx,sy,x,y);\n    uX.clearRect(0,0,uC.width,uC.height);\n  }\n  if(tool!=='graph')saveHist();\n}\n\nfunction applyStyle(ctx){\n  ctx.globalAlpha=op;\n  ctx.strokeStyle=tool==='eraser'?'#ffffff':strokeCol;\n  ctx.fillStyle=fillCol;\n  ctx.lineWidth=tool==='eraser'?sz*4:sz;\n  ctx.lineCap='round';ctx.lineJoin='round';\n  if(ls==='dashed')ctx.setLineDash([sz*3,sz*2]);\n  else if(ls==='dotted')ctx.setLineDash([sz,sz*2.5]);\n  else ctx.setLineDash([]);\n}\n\nfunction drawShape(ctx,t,x1,y1,x2,y2){\n  applyStyle(ctx);ctx.beginPath();\n  if(t==='line'){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}\n  else if(t==='arrow')drawArrow(ctx,x1,y1,x2,y2,false);\n  else if(t==='dbarrow')drawArrow(ctx,x1,y1,x2,y2,true);\n  else if(t==='rect'){if(fillMode==='solid')ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.strokeRect(x1,y1,x2-x1,y2-y1);}\n  else if(t==='circle'){const rx=Math.abs(x2-x1)/2,ry=Math.abs(y2-y1)/2;ctx.ellipse((x1+x2)/2,(y1+y2)/2,rx||1,ry||1,0,0,Math.PI*2);if(fillMode==='solid')ctx.fill();ctx.stroke();}\n  else if(t==='triangle'){ctx.moveTo((x1+x2)/2,y1);ctx.lineTo(x2,y2);ctx.lineTo(x1,y2);ctx.closePath();if(fillMode==='solid')ctx.fill();ctx.stroke();}\n  else if(t==='rtri'){ctx.moveTo(x1,y2);ctx.lineTo(x2,y2);ctx.lineTo(x1,y1);ctx.closePath();if(fillMode==='solid')ctx.fill();ctx.stroke();}\n  else if(t==='diamond'){const mx=(x1+x2)/2,my=(y1+y2)/2;ctx.moveTo(mx,y1);ctx.lineTo(x2,my);ctx.lineTo(mx,y2);ctx.lineTo(x1,my);ctx.closePath();if(fillMode==='solid')ctx.fill();ctx.stroke();}\n  else if(t==='star')drawPoly(ctx,x1,y1,x2,y2,5,true);\n  else if(t==='hexagon')drawPoly(ctx,x1,y1,x2,y2,6,false);\n  else if(t==='pentagon')drawPoly(ctx,x1,y1,x2,y2,5,false);\n  else if(t==='parallelogram'){const sk=(x2-x1)*.2;ctx.moveTo(x1+sk,y1);ctx.lineTo(x2,y1);ctx.lineTo(x2-sk,y2);ctx.lineTo(x1,y2);ctx.closePath();if(fillMode==='solid')ctx.fill();ctx.stroke();}\n  else if(t==='trapezoid'){const sk=(x2-x1)*.2;ctx.moveTo(x1+sk,y1);ctx.lineTo(x2-sk,y1);ctx.lineTo(x2,y2);ctx.lineTo(x1,y2);ctx.closePath();if(fillMode==='solid')ctx.fill();ctx.stroke();}\n  else if(t==='cloud')drawCloud(ctx,x1,y1,x2,y2);\n  else if(t==='cross')drawCross(ctx,x1,y1,x2,y2);\n}\nfunction drawArrow(ctx,x1,y1,x2,y2,dbl){\n  const hl=Math.max(12,sz*4),ang=Math.atan2(y2-y1,x2-x1);\n  ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.beginPath();\n  ctx.moveTo(x2,y2);ctx.lineTo(x2-hl*Math.cos(ang-Math.PI/7),y2-hl*Math.sin(ang-Math.PI/7));\n  ctx.moveTo(x2,y2);ctx.lineTo(x2-hl*Math.cos(ang+Math.PI/7),y2-hl*Math.sin(ang+Math.PI/7));\n  if(dbl){ctx.moveTo(x1,y1);ctx.lineTo(x1+hl*Math.cos(ang-Math.PI/7),y1+hl*Math.sin(ang-Math.PI/7));ctx.moveTo(x1,y1);ctx.lineTo(x1+hl*Math.cos(ang+Math.PI/7),y1+hl*Math.sin(ang+Math.PI/7));}\n  ctx.stroke();\n}\nfunction drawPoly(ctx,x1,y1,x2,y2,sides,star){\n  const cx=(x1+x2)/2,cy=(y1+y2)/2,r=Math.min(Math.abs(x2-x1),Math.abs(y2-y1))/2;\n  const inner=r*.4,pts=star?sides*2:sides;\n  ctx.beginPath();\n  for(let i=0;i<pts;i++){const ang=i*(Math.PI*2/pts)-Math.PI/2,rad=(star&&i%2===1)?inner:r;i===0?ctx.moveTo(cx+rad*Math.cos(ang),cy+rad*Math.sin(ang)):ctx.lineTo(cx+rad*Math.cos(ang),cy+rad*Math.sin(ang));}\n  ctx.closePath();if(fillMode==='solid')ctx.fill();ctx.stroke();\n}\nfunction drawCloud(ctx,x1,y1,x2,y2){\n  const cx=(x1+x2)/2,cy=(y1+y2)/2,w=Math.abs(x2-x1)/2,h=Math.abs(y2-y1)/2;\n  [{x:cx,y:cy-h*.3,r:w*.35},{x:cx-w*.3,y:cy+h*.1,r:w*.25},{x:cx+w*.3,y:cy+h*.1,r:w*.25},{x:cx-w*.55,y:cy+h*.4,r:w*.2},{x:cx+w*.55,y:cy+h*.4,r:w*.2},{x:cx,y:cy+h*.5,r:w*.35}]\n  .forEach(b=>{ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);if(fillMode==='solid')ctx.fill();ctx.stroke();});\n}\nfunction drawCross(ctx,x1,y1,x2,y2){\n  const w=Math.abs(x2-x1),h=Math.abs(y2-y1),t=Math.min(w,h)*.3;\n  const lx=Math.min(x1,x2),ly=Math.min(y1,y2),cx=lx+w/2,cy=ly+h/2;\n  ctx.beginPath();\n  ctx.moveTo(cx-t/2,ly);ctx.lineTo(cx+t/2,ly);ctx.lineTo(cx+t/2,cy-t/2);ctx.lineTo(lx+w,cy-t/2);\n  ctx.lineTo(lx+w,cy+t/2);ctx.lineTo(cx+t/2,cy+t/2);ctx.lineTo(cx+t/2,ly+h);ctx.lineTo(cx-t/2,ly+h);\n  ctx.lineTo(cx-t/2,cy+t/2);ctx.lineTo(lx,cy+t/2);ctx.lineTo(lx,cy-t/2);ctx.lineTo(cx-t/2,cy-t/2);\n  ctx.closePath();if(fillMode==='solid')ctx.fill();ctx.stroke();\n}\n\nfunction commitAxis(x1,y1,x2,y2){\n  const a={x1,y1,x2,y2,dir:axDir,step:axStep,start:axStart,labels:axLabels,origStyle:axOrigStyle,tickSz:axTickSz,color:axColor};\n  axesDrawn.push(a);renderAxis(aX,a);\n}\nfunction redrawAxes(){aX.clearRect(0,0,aC.width,aC.height);axesDrawn.forEach(a=>renderAxis(aX,a));}\nfunction clearAxes(){axesDrawn=[];aX.clearRect(0,0,aC.width,aC.height);}\n\nfunction renderAxis(ctx,a){\n  ctx.save();\n  if(a.dir==='x'||a.dir==='xy')drawSingleAxis(ctx,a,'x');\n  if(a.dir==='y'||a.dir==='xy')drawSingleAxis(ctx,a,'y');\n  ctx.restore();\n}\nfunction drawSingleAxis(ctx,a,dir){\n  const isX=dir==='x';\n  const{x1,y1,x2,y2,step,start,labels,origStyle,tickSz,color}=a;\n  const ax1=x1,ay1=y1,ax2=isX?x2:x1,ay2=isX?y1:y2;\n  const len=isX?Math.abs(x2-x1):Math.abs(y2-y1);\n  const sign=isX?(x2>x1?1:-1):(y2>y1?1:-1);\n  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.lineCap='round';ctx.setLineDash([]);\n  if(origStyle==='wiggle'){\n    ctx.beginPath();\n    if(isX){ctx.moveTo(ax1,ay1);for(let i=0;i<5;i++){ctx.lineTo(ax1+sign*(i+1)*4,ay1+(i%2===0?-5:5));}ctx.lineTo(ax1+sign*24,ay1);}\n    else{ctx.moveTo(ax1,ay1);for(let i=0;i<5;i++){ctx.lineTo(ax1+(i%2===0?-5:5),ay1+sign*(i+1)*4);}ctx.lineTo(ax1,ay1+sign*24);}\n    ctx.stroke();\n  } else if(origStyle==='zero'){\n    ctx.font='bold 11px DM Mono,monospace';ctx.textAlign='center';\n    ctx.fillText('0',ax1+(isX?0:-14),ay1+(isX?14:0));\n  }\n  ctx.beginPath();ctx.moveTo(ax1+(isX?20:0),ay1+(isX?0:20));ctx.lineTo(ax2,ay2);ctx.stroke();\n  const ang=isX?(x2>x1?0:Math.PI):(y2>y1?Math.PI/2:-Math.PI/2),hl=12;\n  ctx.beginPath();\n  ctx.moveTo(ax2,ay2);ctx.lineTo(ax2-hl*Math.cos(ang-Math.PI/7),ay2-hl*Math.sin(ang-Math.PI/7));\n  ctx.moveTo(ax2,ay2);ctx.lineTo(ax2-hl*Math.cos(ang+Math.PI/7),ay2-hl*Math.sin(ang+Math.PI/7));\n  ctx.stroke();\n  const pixPerStep=len/Math.max(1,Math.round(len/(tickSz*5)))*step;\n  const nTicks=Math.floor(len/pixPerStep);\n  ctx.font='10px DM Mono,monospace';\n  for(let i=1;i<=nTicks;i++){\n    const px=isX?ax1+sign*i*pixPerStep:ax1,py=isX?ay1:ay1+sign*i*pixPerStep;\n    ctx.beginPath();\n    ctx.moveTo(isX?px:px-tickSz/2,isX?py-tickSz/2:py);\n    ctx.lineTo(isX?px:px+tickSz/2,isX?py+tickSz/2:py);\n    ctx.stroke();\n    if(labels){const val=start+(i*step);ctx.textAlign='center';ctx.fillText(val,isX?px:px-(tickSz+10),isX?py+(tickSz+12):py+4);}\n  }\n  ctx.font='bold 12px DM Sans';ctx.textAlign='left';\n  ctx.fillText(isX?'x':'y',ax2+(isX?4:-14),ay2+(isX?-6:4));\n}\n\nfunction showTxtInput(x,y){\n  txtPos={x,y};\n  const ov=document.getElementById('to'),inp=document.getElementById('ti');\n  ov.style.display='block';ov.style.left=x+'px';ov.style.top=(y-22)+'px';\n  inp.style.fontSize=txtSize+'px';inp.style.fontWeight=txtStyle==='bold'?'700':'400';inp.style.fontStyle=txtStyle==='italic'?'italic':'normal';inp.style.color=strokeCol;inp.value='';inp.focus();\n}\nfunction commitTxt(e){\n  if(e.key==='Enter'||e.key==='Escape'){\n    const v=document.getElementById('ti').value;\n    if(v&&e.key==='Enter'){dX.globalAlpha=op;dX.fillStyle=strokeCol;dX.font=`${txtStyle==='italic'?'italic ':''} ${txtStyle==='bold'?'700':'400'} ${txtSize}px DM Sans,Arial`;dX.fillText(v,txtPos.x,txtPos.y);saveHist();}\n    document.getElementById('to').style.display='none';\n  }\n}\n\nfunction drawRulerLines(mx,my){\n  uX.clearRect(0,0,uC.width,uC.height);\n  uX.strokeStyle='rgba(59,158,255,.4)';uX.lineWidth=1;uX.setLineDash([4,4]);\n  uX.beginPath();uX.moveTo(mx,0);uX.lineTo(mx,uC.height);uX.stroke();\n  uX.beginPath();uX.moveTo(0,my);uX.lineTo(uC.width,my);uX.stroke();\n  uX.setLineDash([]);uX.fillStyle='rgba(59,158,255,.9)';uX.font='9px DM Mono,monospace';\n  uX.fillText(`${Math.round(mx)},${Math.round(my)}`,mx+5,my-4);\n}\n\nfunction addFn(){const def=['sin(x)','x^2/4','cos(x)','tan(x)','sqrt(abs(x))','1/x'];fns.push({expr:fns.length<def.length?def[fns.length]:'',color:fnCols[fnCI++%fnCols.length]});renderFnList();}\nfunction renderFnList(){\n  const el=document.getElementById('fnlist');el.innerHTML='';\n  fns.forEach((fn,i)=>{\n    const r=document.createElement('div');r.className='fnrow';\n    r.innerHTML=`<div class=\"fdot\" style=\"background:${fn.color}\" onclick=\"cycleFnC(${i})\"><\/div><input class=\"finp\" value=\"${fn.expr}\" placeholder=\"sin(x)\" oninput=\"fns[${i}].expr=this.value;plotGraph()\"><button class=\"fdel\" onclick=\"rmFn(${i})\">\u00d7<\/button>`;\n    el.appendChild(r);\n  });\n}\nfunction cycleFnC(i){fns[i].color=fnCols[fnCI++%fnCols.length];renderFnList();plotGraph();}\nfunction rmFn(i){fns.splice(i,1);renderFnList();plotGraph();}\n\nfunction plotGraph(){\n  const W=gC.width,H=gC.height;gX.clearRect(0,0,W,H);\n  const xmin=+document.getElementById('xmin').value,xmax=+document.getElementById('xmax').value;\n  const ymin=+document.getElementById('ymin').value,ymax=+document.getElementById('ymax').value;\n  if(xmin>=xmax||ymin>=ymax)return;\n  const tX=v=>((v-xmin)/(xmax-xmin))*W,tY=v=>H-((v-ymin)/(ymax-ymin))*H;\n  gX.fillStyle='rgba(255,255,255,0.93)';gX.fillRect(0,0,W,H);\n  const xs=calcStep(xmax-xmin),ys=calcStep(ymax-ymin);\n  gX.strokeStyle='rgba(0,0,0,.05)';gX.lineWidth=1;\n  for(let gx=Math.ceil(xmin/xs)*xs;gx<=xmax;gx+=xs){gX.beginPath();gX.moveTo(tX(gx),0);gX.lineTo(tX(gx),H);gX.stroke();}\n  for(let gy=Math.ceil(ymin/ys)*ys;gy<=ymax;gy+=ys){gX.beginPath();gX.moveTo(0,tY(gy));gX.lineTo(W,tY(gy));gX.stroke();}\n  gX.strokeStyle='rgba(0,0,0,.4)';gX.lineWidth=1.5;gX.setLineDash([]);\n  const ax0=xmin<=0&&0<=xmax?tX(0):null,ay0=ymin<=0&&0<=ymax?tY(0):null;\n  if(ay0!=null){gX.beginPath();gX.moveTo(0,ay0);gX.lineTo(W,ay0);gX.stroke();atip(W-12,ay0,W,ay0);}\n  if(ax0!=null){gX.beginPath();gX.moveTo(ax0,H);gX.lineTo(ax0,0);gX.stroke();atip(ax0,12,ax0,0);}\n  gX.fillStyle='rgba(0,0,0,.45)';gX.font='9px DM Mono,monospace';\n  const ly=ay0!=null?Math.min(ay0+12,H-4):H-4,lx=ax0!=null?Math.max(ax0-5,5):5;\n  for(let gx=Math.ceil(xmin/xs)*xs;gx<=xmax;gx+=xs){if(Math.abs(gx)<xs*.01)continue;gX.textAlign='center';gX.fillText(nFmt(gx),tX(gx),ly);}\n  for(let gy=Math.ceil(ymin/ys)*ys;gy<=ymax;gy+=ys){if(Math.abs(gy)<ys*.01)continue;gX.textAlign='right';gX.fillText(nFmt(gy),lx+26,tY(gy)+4);}\n  gX.fillStyle='#333';gX.font='bold 10px DM Sans';\n  if(ay0!=null){gX.textAlign='left';gX.fillText('x',W-7,ay0-5);}\n  if(ax0!=null){gX.textAlign='left';gX.fillText('y',ax0+4,12);}\n  fns.forEach(fn=>{\n    if(!fn.expr.trim())return;\n    gX.strokeStyle=fn.color;gX.lineWidth=2.5;gX.setLineDash([]);gX.beginPath();let first=true;\n    for(let px=0;px<=W*2;px++){\n      const x=xmin+(px/(W*2))*(xmax-xmin);let y;\n      try{y=evalFn(fn.expr,x);}catch(e){first=true;continue;}\n      if(!isFinite(y)||isNaN(y)||Math.abs(y)>1e7){first=true;continue;}\n      const prev=px>0?(()=>{try{return evalFn(fn.expr,xmin+((px-1)/(W*2))*(xmax-xmin));}catch(e){return NaN;}})():NaN;\n      if(isFinite(prev)&&Math.abs(y-prev)>(ymax-ymin)*.6)first=true;\n      const cy=tY(y);if(first){gX.moveTo(tX(x),cy);first=false;}else gX.lineTo(tX(x),cy);\n    }\n    gX.stroke();\n    try{const lx2=xmax-(xmax-xmin)*.04,ly2=evalFn(fn.expr,lx2);if(isFinite(ly2)&&ly2>ymin&&ly2<ymax){gX.fillStyle=fn.color;gX.font='bold 10px DM Sans';gX.textAlign='right';gX.fillText('y='+fn.expr,tX(lx2)-4,tY(ly2)-6);}}catch(e){}\n  });\n}\nfunction atip(fx,fy,tx,ty){const ang=Math.atan2(ty-fy,tx-fx),hl=9;gX.beginPath();gX.moveTo(tx,ty);gX.lineTo(tx-hl*Math.cos(ang-Math.PI/7),ty-hl*Math.sin(ang-Math.PI/7));gX.moveTo(tx,ty);gX.lineTo(tx-hl*Math.cos(ang+Math.PI/7),ty-hl*Math.sin(ang+Math.PI/7));gX.stroke();}\nfunction calcStep(r){const raw=r/8,mag=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/mag;return n<1.5?mag:n<3.5?2*mag:n<7.5?5*mag:10*mag;}\nfunction nFmt(n){if(Math.abs(n)>=1000)return n.toExponential(0);return parseFloat(n.toPrecision(4)).toString();}\nfunction evalFn(expr,x){\n  let e=expr.replace(/\\^/g,'**').replace(/\\bsin\\b/g,'Math.sin').replace(/\\bcos\\b/g,'Math.cos').replace(/\\btan\\b/g,'Math.tan').replace(/\\bsqrt\\b/g,'Math.sqrt').replace(/\\bcbrt\\b/g,'Math.cbrt').replace(/\\babs\\b/g,'Math.abs').replace(/\\blog\\b/g,'Math.log10').replace(/\\bln\\b/g,'Math.log').replace(/\\bexp\\b/g,'Math.exp').replace(/\\bfloor\\b/g,'Math.floor').replace(/\\bceil\\b/g,'Math.ceil').replace(/\\bpi\\b/gi,'Math.PI').replace(/\\be\\b(?![a-zA-Z])/g,'Math.E').replace(/(\\d)(x)/g,'$1*$2').replace(/(x)(\\d)/g,'$1*$2');\n  return Function('\"use strict\";var x=arguments[0];return('+e+')')(x);\n}\nfunction clearGraph(){gX.clearRect(0,0,gC.width,gC.height);}\nfunction zoomInG(){['xmin','xmax','ymin','ymax'].forEach(id=>{document.getElementById(id).value=+document.getElementById(id).value*.7;});plotGraph();}\nfunction zoomOutG(){['xmin','xmax','ymin','ymax'].forEach(id=>{document.getElementById(id).value=+document.getElementById(id).value*1.43;});plotGraph();}\nfunction resetGV(){document.getElementById('xmin').value=-10;document.getElementById('xmax').value=10;document.getElementById('ymin').value=-10;document.getElementById('ymax').value=10;plotGraph();}\n\nfunction saveHist(){\n  if(dC.width===0||dC.height===0)return;\n  history.push(dX.getImageData(0,0,dC.width,dC.height));\n  if(history.length>50)history.shift();\n  redoStack=[];\n}\nfunction undo(){if(history.length<=1)return;redoStack.push(history.pop());dX.putImageData(history[history.length-1],0,0);}\nfunction redo(){if(!redoStack.length)return;const s=redoStack.pop();history.push(s);dX.putImageData(s,0,0);}\n\nfunction clearAll(){if(!confirm('Clear everything?'))return;dX.clearRect(0,0,dC.width,dC.height);clearGraph();clearAxes();history=[];saveHist();}\nfunction newCanvas(){if(!confirm('Start fresh?'))return;dX.clearRect(0,0,dC.width,dC.height);clearGraph();clearAxes();history=[];saveHist();}\n\nfunction mergedCanvas(){\n  const m=document.createElement('canvas');m.width=dC.width;m.height=dC.height;\n  const mx=m.getContext('2d');mx.fillStyle='white';mx.fillRect(0,0,m.width,m.height);\n  mx.drawImage(gC,0,0);mx.drawImage(aC,0,0);mx.drawImage(dC,0,0);return m;\n}\nfunction saveAsPNG(){const a=document.createElement('a');a.download='myp-drawing-'+new Date().toISOString().slice(0,10)+'.png';a.href=mergedCanvas().toDataURL('image/png');a.click();}\nasync function copyImg(){\n  mergedCanvas().toBlob(async b=>{\n    try{await navigator.clipboard.write([new ClipboardItem({'image/png':b})]);flash('\u2705 Copied!');}\n    catch(e){flash('\u26a0\ufe0f Try Save PNG instead');}\n  });\n}\n\nfunction insertToQuestion(){\n  const dataURL=mergedCanvas().toDataURL('image/png');\n  if(window.parent&&window.parent!==window){\n    window.parent.postMessage({type:'myp-drawing-insert',dataURL},'*');\n    flash('\u2705 Inserted into answer box!',3000);\n  } else {\n    mergedCanvas().toBlob(async b=>{\n      try{\n        await navigator.clipboard.write([new ClipboardItem({'image/png':b})]);\n        flash('\u2705 Copied! Now Ctrl+V into any answer box.',3000);\n      }catch(e){\n        const win=window.open('','_blank');\n        win.document.write(`<html><body style=\"margin:0;background:#111;padding:12px;font-family:sans-serif;color:white;\">\n          <p style=\"margin-bottom:8px;\">Right-click the image \u2192 <b>Copy image<\/b>, then paste into your answer box.<\/p>\n          <img src=\"${dataURL}\" style=\"max-width:100%;display:block;border:1px solid #333;\"><\/body><\/html>`);\n        flash('\ud83d\udccb Opened in new tab \u2014 right-click \u2192 Copy image',4000);\n      }\n    });\n  }\n}\n\nfunction doZoom(d){zoomLvl=Math.max(.2,Math.min(5,zoomLvl+d));document.getElementById('zlbl').textContent=Math.round(zoomLvl*100)+'%';[dC,gC,aC].forEach(c=>{c.style.transform=`scale(${zoomLvl})`;c.style.transformOrigin='top left';});}\nfunction resetZoom(){zoomLvl=1;document.getElementById('zlbl').textContent='100%';[dC,gC,aC].forEach(c=>{c.style.transform='';c.style.transformOrigin='';});}\nfunction toggleGrid(){showGrid=!showGrid;document.getElementById('gridbtn').classList.toggle('active',showGrid);const wr=document.getElementById('cw');wr.style.backgroundImage=showGrid?'linear-gradient(rgba(0,90,150,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(0,90,150,.08) 1px,transparent 1px)':'radial-gradient(circle,#c8d3e0 1px,transparent 1px),radial-gradient(circle,#c8d3e0 1px,transparent 1px)';}\nfunction toggleSnap(){snapOn=!snapOn;document.getElementById('snapbtn').classList.toggle('active',snapOn);}\nfunction toggleRuler(){showRuler=!showRuler;document.getElementById('rulerbtn').classList.toggle('active',showRuler);if(!showRuler)uX.clearRect(0,0,uC.width,uC.height);}\n\nfunction flash(msg,dur=2200){const el=document.getElementById('stmsg');el.textContent=msg;clearTimeout(flash._t);flash._t=setTimeout(()=>el.textContent='',dur);}\n\ndocument.addEventListener('keydown',e=>{\n  if(e.target.tagName==='INPUT')return;\n  if(e.ctrlKey||e.metaKey){if(e.key==='z'){e.preventDefault();undo();}if(e.key==='y'){e.preventDefault();redo();}if(e.key==='s'){e.preventDefault();saveAsPNG();}}\n  const map={p:'pen',e:'eraser',l:'line',a:'arrow',r:'rect',c:'circle',t:'text'};\n  if(!e.ctrlKey&&!e.metaKey&&map[e.key])setTool(map[e.key]);\n});\n\nwindow.addEventListener('message', function(e) {\n  if(e.data && e.data.type === 'myp-request-insert') insertToQuestion();\n});\n\ninit();\n<\/script>\n<\/body>\n<\/html>\n"
}

// ═══════════════════════════════════════════════════════════
//  IMAGE UPLOAD UTILITY
// ═══════════════════════════════════════════════════════════
function handleImageUpload(files, targetEditable) {
    if(!files || !files.length) return;
    const file = files[0];
    if(!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = `<img src="${e.target.result}" style="max-width:100%;border:1px solid #ccc;margin-top:8px;display:block;" alt="Uploaded image">`;
        targetEditable.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(targetEditable);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertHTML', false, img);
        saveWork();
    };
    reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════════════
//  BLOCK BUILDERS
// ═══════════════════════════════════════════════════════════
function addSnip() {
    const id = 'block-' + Date.now();
    $("#q-list").append(`<div class="q-block" id="${id}" style="border:2px dashed var(--snip-orange);background:#fffaf5;">
        <div class="block-header" style="background:#fff1e6;color:var(--snip-orange);">
            <span>✂️ QUESTION SNIP</span>
            <div style="display:flex;gap:6px;align-items:center;">
                <label class="t-btn-upload" style="cursor:pointer;">
                    📎 Upload Image
                    <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(this.files, document.querySelector('#${id} .ans-editable')); this.value='';">
                </label>
                <button class="btn btn-danger" onclick="$('#${id}').remove();saveWork();">Remove</button>
            </div>
        </div>
        <div class="ans-editable" contenteditable="true" oninput="saveWork();" placeholder="Paste image here (Ctrl+V / Cmd+V) or use Upload above..."></div>
        <div class="mac-paste-hint" id="mph-${id}" style="${isMac ? 'display:block;' : ''}">💡 Mac: Use <b>Cmd+Shift+4</b> to snip, then <b>Cmd+V</b> here — or use <b>📎 Upload Image</b> above.</div>
    </div>`);
    saveWork();
}

function insertTable() {
    const rows = prompt("Enter number of rows:", "3");
    const cols = prompt("Enter number of columns:", "3");
    if(!rows || !cols || isNaN(rows) || isNaN(cols)) return;
    let table = `<table style="border-collapse:collapse;width:100%;margin:15px 0;border:1px solid black;">`;
    for(let i=0;i<rows;i++) {
        table += "<tr>";
        for(let j=0;j<cols;j++) table += `<td style="border:1px solid black;padding:10px;min-width:50px;height:30px;vertical-align:top;">&nbsp;</td>`;
        table += "</tr>";
    }
    table += "</table><p>&nbsp;</p>";
    document.execCommand('insertHTML', false, table);
    saveWork();
}

function addQ() {
    const id = Date.now();
    const blockId = 'block-' + id;
    $("#q-list").append(`
        <div class="q-block" id="${blockId}">
            <div class="block-header" style="background:#f8f9fa;color:var(--ib-blue);">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span>📝</span>
                    <input type="text" class="q-label-input" placeholder="Question # (e.g. 1a)..." oninput="saveWork()">
                </div>
                <button class="btn btn-danger" onclick="$('#${blockId}').remove();saveWork();">Delete</button>
            </div>
            <div class="toolbar">
                <div class="tool-group">
                    <button class="t-btn" onclick="document.execCommand('undo')">↶</button>
                    <button class="t-btn" onclick="document.execCommand('redo')">↷</button>
                </div>
                <div class="tool-group">
                    <button class="t-btn" onclick="document.execCommand('bold')"><b>B</b></button>
                    <button class="t-btn" style="font-style:italic;" onclick="document.execCommand('italic')">I</button>
                    <button class="t-btn" style="text-decoration:underline;" onclick="document.execCommand('underline')">U</button>
                </div>
                <div class="tool-group">
                    <button class="t-btn" onclick="document.execCommand('subscript')">x₂</button>
                    <button class="t-btn" onclick="document.execCommand('superscript')">x²</button>
                </div>
                <div class="tool-group">
                    <button class="t-btn" onclick="document.execCommand('insertUnorderedList')">• List</button>
                </div>
                <div class="tool-group">
                    <button class="t-btn" onclick="insertTable()">田 Table</button>
                </div>
                <div class="tool-group" style="border-right:none;">
                    <label class="t-btn-upload" style="cursor:pointer;">
                        📎 Upload Image
                        <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(this.files, document.querySelector('#${blockId} .ans-editable')); this.value='';">
                    </label>
                </div>
            </div>
            <div class="ans-editable" contenteditable="true" oninput="updateCounts(${id},this);saveWork();"></div>
            <div class="mac-paste-hint" id="mph-${blockId}" style="${isMac ? 'display:block;' : ''}">
                💡 Mac: Use <b>Cmd+Shift+4</b> to snip, then <b>Cmd+V</b> — or use <b>📎 Upload Image</b> above.
            </div>
            <div class="block-footer">
                <span style="color:#aaa;font-style:italic;margin-right:auto;font-size:11px;">📎 Upload Image (all devices) or Ctrl+V / Cmd+V to paste a snip</span>
                <span id="word-count-${id}">0 words</span>
                <span id="char-count-${id}">0 chars</span>
            </div>
        </div>`);
    saveWork();
}

function updateCounts(id, el) {
    const text = el.innerText || "";
    const words = text.trim().split(/\s+/).filter(w=>w.length>0).length;
    $(`#word-count-${id}`).text(`${words} word${words!==1?'s':''}`);
    $(`#char-count-${id}`).text(`${text.length} chars`);
}

function changePDF() {
    const choice = confirm("Upload a PDF from your computer?\n\nOK = Upload from computer\nCancel = Paste a URL");
    if(choice) {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'application/pdf';
        input.onchange = function() {
            if(!input.files[0]) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                _uploadedPDFDataURL = e.target.result;
                document.getElementById('pdf-frame').src = e.target.result;
                localStorage.setItem(LS_PDF, e.target.result);
                localStorage.setItem(LS_PDF_SRC, 'upload');
            };
            reader.readAsDataURL(input.files[0]);
        };
        input.click();
    } else {
        const newUrl = prompt("Paste new Past Paper PDF URL:");
        if(newUrl) {
            document.getElementById('pdf-frame').src = newUrl;
            _uploadedPDFDataURL = null;
            localStorage.setItem(LS_PDF, newUrl);
            localStorage.setItem(LS_PDF_SRC, 'url');
        }
    }
}

// Tablet pane switcher
function switchPane(which) {
    const pdfPane  = document.querySelector('.main-container .pane:first-child');
    const workPane = document.getElementById('work-pane');
    const tabs = document.querySelectorAll('#pane-tabs button');
    if(which === 'pdf') {
        pdfPane.classList.remove('tab-hidden'); workPane.classList.add('tab-hidden');
        tabs[0].classList.add('active'); tabs[1].classList.remove('active');
    } else {
        pdfPane.classList.add('tab-hidden'); workPane.classList.remove('tab-hidden');
        tabs[0].classList.remove('active'); tabs[1].classList.add('active');
    }
}

// ═══════════════════════════════════════════════════════════
//  MWS ENCODE / DECODE
//  v3 now supports pdfSrcType to distinguish url vs uploaded PDF
// ═══════════════════════════════════════════════════════════
function encodeMWS() {
    const pdfSrc = document.getElementById('pdf-frame').src || '';
    const pdfSrcType = _uploadedPDFDataURL ? 'upload' : 'url';
    const blocks = [];
    document.querySelectorAll('#q-list .q-block').forEach(block => {
        const labelInput = block.querySelector('.q-label-input');
        const editable   = block.querySelector('.ans-editable');
        const isSnip     = block.style.border && block.style.border.includes('dashed');
        blocks.push({
            t: isSnip ? 's' : 'a',
            l: labelInput ? labelInput.value : '',
            h: editable ? editable.innerHTML : ''
        });
    });
    const urlB64       = btoa(unescape(encodeURIComponent(pdfSrc)));
    const blocksB64    = btoa(unescape(encodeURIComponent(JSON.stringify(blocks))));
    const typeB64      = btoa(pdfSrcType);
    return `MWS:3:url=${urlB64}&blocks=${blocksB64}&type=${typeB64}&s=${seconds}`;
}

function decodeMWS(code) {
    try {
        const inner = code.replace(/^MWS:[123]:/, '');
        const params = {};
        inner.split('&').forEach(pair => {
            const idx = pair.indexOf('=');
            if(idx > -1) params[pair.slice(0,idx)] = pair.slice(idx+1);
        });
        const pdfUrl       = decodeURIComponent(escape(atob(params.url || '')));
        const blocks       = JSON.parse(decodeURIComponent(escape(atob(params.blocks || 'W10='))));
        const savedSeconds = params.s ? parseInt(params.s, 10) : null;
        const pdfSrcType   = params.type ? atob(params.type) : 'url';
        return { pdfUrl, blocks, savedSeconds, pdfSrcType };
    } catch(e) { return null; }
}

function isTablet() {
    return window.innerWidth <= 900 || /Android|iPad|iPhone|iPod|tablet/i.test(navigator.userAgent);
}

// ═══════════════════════════════════════════════════════════
//  BUILD EXPORT HTML
// ═══════════════════════════════════════════════════════════
function buildExportHTML() {
    const pdfUrl  = (_uploadedPDFDataURL ? '[Uploaded PDF — see .mws file]' : document.getElementById('pdf-frame').src) || '';
    const dateStr = new Date().toLocaleString();
    let blocksHTML = '';
    document.querySelectorAll('#q-list .q-block').forEach((block, i) => {
        const labelInput = block.querySelector('.q-label-input');
        const editable   = block.querySelector('.ans-editable');
        const isSnip     = block.style.border && block.style.border.includes('dashed');
        const label      = isSnip ? 'Question Snip ' + (i+1)
            : (labelInput && labelInput.value.trim() ? labelInput.value.trim() : 'Question ' + (i+1));
        const content = editable ? editable.innerHTML : '';
        const hbg = isSnip ? '#fff1e6' : '#f0f5fa';
        const hcl = isSnip ? '#e67e22' : '#005a96';
        blocksHTML += `
        <div style="border:1px solid #ccc;border-radius:8px;margin-bottom:28px;overflow:hidden;page-break-inside:avoid;">
            <div style="background:${hbg};color:${hcl};padding:10px 16px;font-weight:bold;font-size:15px;border-bottom:1px solid #ddd;">
                ${isSnip ? '✂️ ' : '📝 '}${label}
            </div>
            <div style="padding:20px 24px;font-size:15px;line-height:1.6;background:white;">
                ${content || '<em style="color:#aaa;">No answer written.</em>'}
            </div>
        </div>`;
    });
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>MYP Workspace — Saved Answers</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:#222;}
h1{color:#005a96;font-size:26px;margin-bottom:4px;}.meta{color:#888;font-size:13px;margin-bottom:28px;}
img{max-width:100%;border:1px solid #ccc;margin:8px 0;display:block;}table{border-collapse:collapse;width:100%;margin:10px 0;}td,th{border:1px solid #ccc;padding:8px;}
@media print{body{margin:20px;}.no-print{display:none;}}</style></head><body>
<div class="no-print" style="background:#005a96;color:white;padding:12px 20px;border-radius:8px;margin-bottom:24px;font-size:13px;">
  💡 To save as PDF — browser menu → Print. To continue editing — go to <a href="https://themypworkspace-og.github.io/the-myp-workspace-V1/" style="color:#7dd3fc;">The MYP Workspace™</a> and load your .mws file.</div>
<h1>The MYP Workspace™ — Saved Answers</h1>
<p class="meta">Saved: ${dateStr}${pdfUrl && !pdfUrl.startsWith('data:') ? ' · Paper: <a href="' + pdfUrl + '" style="color:#005a96;">View PDF</a>' : ''}</p>
${blocksHTML || '<p style="color:#aaa;font-style:italic;">No answer blocks found.</p>'}
<p style="font-size:11px;color:#ccc;margin-top:40px;text-align:center;">Generated by The MYP Workspace™</p></body></html>`;
}

// ═══════════════════════════════════════════════════════════
//  SAVE SESSION
// ═══════════════════════════════════════════════════════════
function saveSession() {
    const mwsCode  = encodeMWS();
    const pdfUrl   = document.getElementById('pdf-frame').src || '';
    const dateStr  = new Date().toLocaleString();
    const fileDate = new Date().toISOString().slice(0,10);

    let readable  = '================================================\n';
    readable     += '  MYP WORKSPACE — SAVED SESSION\n';
    readable     += '  ' + dateStr + '\n';
    readable     += '================================================\n\n';
    readable     += '  📂 TO CONTINUE EDITING: Upload this .mws file\n';
    readable     += '     at The MYP Workspace → "Load Session"\n\n';
    readable     += '================================================\n\n';
    readable     += 'Past Paper: ' + (pdfUrl.startsWith('data:') ? '[Uploaded PDF — embedded below]' : pdfUrl) + '\n\n';
    readable     += '------------------------------------------------\n\n';

    document.querySelectorAll('#q-list .q-block').forEach((block, i) => {
        const labelInput = block.querySelector('.q-label-input');
        const editable   = block.querySelector('.ans-editable');
        const isSnip     = block.style.border && block.style.border.includes('dashed');
        const label      = isSnip ? '[ Question Snip ' + (i+1) + ' ]'
                                  : (labelInput && labelInput.value.trim() ? labelInput.value.trim() : 'Question ' + (i+1));
        const rawText = (editable ? editable.innerHTML : '')
            .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
            .replace(/<img[^>]*>/gi, '[image — see exported HTML for visual]')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').trim();
        readable += label + '\n' + (rawText || '(no text answer)') + '\n\n';
        readable += '------------------------------------------------\n\n';
    });

    readable += '\n================================================\n';
    readable += '  RESTORE CODE — do not edit below this line\n';
    readable += '  (images + PDF may make this file large)\n';
    readable += '================================================\n';
    readable += mwsCode + '\n';

    const mwsBlob = new Blob([readable], { type: 'text/plain;charset=utf-8' });
    const mwsUrl  = URL.createObjectURL(mwsBlob);
    const a1 = document.createElement('a');
    a1.href = mwsUrl; a1.download = 'MYP-Session-' + fileDate + '.mws';
    document.body.appendChild(a1); a1.click();
    document.body.removeChild(a1);
    URL.revokeObjectURL(mwsUrl);

    // Mark as clean after explicit save
    markClean();

    if(isTablet()) {
        setTimeout(() => {
            const htmlBlob = new Blob([buildExportHTML()], { type: 'text/html;charset=utf-8' });
            const htmlUrl  = URL.createObjectURL(htmlBlob);
            const a2 = document.createElement('a');
            a2.href = htmlUrl; a2.download = 'MYP-Answers-' + fileDate + '.html';
            document.body.appendChild(a2); a2.click();
            document.body.removeChild(a2);
            URL.revokeObjectURL(htmlUrl);
        }, 600);
    } else {
        setTimeout(() => window.print(), 800);
    }
}

// ═══════════════════════════════════════════════════════════
//  LOAD SESSION
// ═══════════════════════════════════════════════════════════
function handleMWSUpload(file) {
    if(!file) return;
    const statusEl = document.getElementById('scan-status');
    statusEl.textContent = '🔍 Reading session file…';
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const match = text.match(/MWS:[123]:[^\r\n]+/);
        if(!match) { statusEl.textContent = '❌ No session code found. Make sure you upload a .mws file.'; return; }
        const parsed = decodeMWS(match[0]);
        if(!parsed) { statusEl.textContent = '❌ Session code is corrupted.'; return; }
        statusEl.textContent = '✅ Session found! Restoring…';
        setTimeout(() => { $('#load-modal').hide(); restoreSession(parsed.pdfUrl, parsed.blocks, parsed.savedSeconds, parsed.pdfSrcType); }, 500);
    };
    reader.onerror = function() { statusEl.textContent = '❌ Could not read file.'; };
    reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════
//  RESTORE SESSION
// ═══════════════════════════════════════════════════════════
let _pendingRestore = null;

function restoreSession(pdfUrl, blocks, savedSeconds, pdfSrcType) {
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('pdf-frame').src = pdfUrl;

    // Track whether this was an uploaded PDF
    if(pdfSrcType === 'upload' && pdfUrl.startsWith('data:')) {
        _uploadedPDFDataURL = pdfUrl;
    } else {
        _uploadedPDFDataURL = null;
        document.getElementById('pdf-url').value = pdfUrl || '';
    }

    $("#q-list").empty();
    blocks.forEach(b => {
        const type  = b.t || b.type;
        const label = b.l !== undefined ? b.l : (b.label || '');
        const html  = b.h !== undefined ? b.h : (b.html || '');

        if(type === 's' || type === 'snip') {
            const id = 'block-' + Date.now() + Math.floor(Math.random()*9999);
            $("#q-list").append(`<div class="q-block" id="${id}" style="border:2px dashed var(--snip-orange);background:#fffaf5;">
                <div class="block-header" style="background:#fff1e6;color:var(--snip-orange);">
                    <span>✂️ QUESTION SNIP</span>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <label class="t-btn-upload" style="cursor:pointer;">📎 Upload Image
                            <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(this.files, document.querySelector('#${id} .ans-editable')); this.value='';">
                        </label>
                        <button class="btn btn-danger" onclick="$('#${id}').remove();saveWork();">Remove</button>
                    </div>
                </div>
                <div class="ans-editable" contenteditable="true" oninput="saveWork();">${html}</div>
                <div class="mac-paste-hint" style="${isMac ? 'display:block;' : ''}">💡 Mac: Use <b>Cmd+Shift+4</b> to snip, then <b>Cmd+V</b> — or use <b>📎 Upload Image</b>.</div>
            </div>`);
        } else {
            const numId = Date.now() + Math.floor(Math.random()*99999);
            const blockId = 'block-' + numId;
            const safeLabel = label.replace(/"/g,'&quot;');
            $("#q-list").append(`
                <div class="q-block" id="${blockId}">
                    <div class="block-header" style="background:#f8f9fa;color:var(--ib-blue);">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span>📝</span>
                            <input type="text" class="q-label-input" placeholder="Question # (e.g. 1a)..." value="${safeLabel}" oninput="saveWork()">
                        </div>
                        <button class="btn btn-danger" onclick="$('#${blockId}').remove();saveWork();">Delete</button>
                    </div>
                    <div class="toolbar">
                        <div class="tool-group">
                            <button class="t-btn" onclick="document.execCommand('undo')">↶</button>
                            <button class="t-btn" onclick="document.execCommand('redo')">↷</button>
                        </div>
                        <div class="tool-group">
                            <button class="t-btn" onclick="document.execCommand('bold')"><b>B</b></button>
                            <button class="t-btn" style="font-style:italic;" onclick="document.execCommand('italic')">I</button>
                            <button class="t-btn" style="text-decoration:underline;" onclick="document.execCommand('underline')">U</button>
                        </div>
                        <div class="tool-group">
                            <button class="t-btn" onclick="document.execCommand('subscript')">x₂</button>
                            <button class="t-btn" onclick="document.execCommand('superscript')">x²</button>
                        </div>
                        <div class="tool-group">
                            <button class="t-btn" onclick="document.execCommand('insertUnorderedList')">• List</button>
                        </div>
                        <div class="tool-group">
                            <button class="t-btn" onclick="insertTable()">田 Table</button>
                        </div>
                        <div class="tool-group" style="border-right:none;">
                            <label class="t-btn-upload" style="cursor:pointer;">📎 Upload Image
                                <input type="file" accept="image/*" style="display:none;" onchange="handleImageUpload(this.files, document.querySelector('#${blockId} .ans-editable')); this.value='';">
                            </label>
                        </div>
                    </div>
                    <div class="ans-editable" contenteditable="true" oninput="updateCounts(${numId},this);saveWork();">${html}</div>
                    <div class="mac-paste-hint" style="${isMac ? 'display:block;' : ''}">💡 Mac: <b>Cmd+Shift+4</b> to snip, <b>Cmd+V</b> to paste — or use <b>📎 Upload Image</b>.</div>
                    <div class="block-footer">
                        <span style="color:#aaa;font-style:italic;margin-right:auto;font-size:11px;">📎 Upload Image (all devices) or Ctrl+V / Cmd+V</span>
                        <span id="word-count-${numId}">0 words</span>
                        <span id="char-count-${numId}">0 chars</span>
                    </div>
                </div>`);
        }
    });

    // Start autosave
    if(!draftEnabled) toggleDraft();

    if(savedSeconds != null && savedSeconds > 0) {
        const h = Math.floor(savedSeconds/3600).toString().padStart(2,'0');
        const m = Math.floor((savedSeconds%3600)/60).toString().padStart(2,'0');
        const s = (savedSeconds%60).toString().padStart(2,'0');
        const formatted = `${h}:${m}:${s}`;
        document.getElementById('saved-time-display').textContent = formatted;
        document.getElementById('saved-time-btn').textContent = formatted;
        document.getElementById('new-timer-input').value = formatted;
        _pendingRestore = savedSeconds;
        document.getElementById('timer-restore-modal').style.display = 'flex';
    } else {
        const t = document.getElementById('timer-input').value.split(':');
        seconds = (+t[0]*3600) + (+t[1]*60) + (+t[2]);
        running = true; startClock();
    }
}

function confirmTimerRestore(useSaved) {
    document.getElementById('timer-restore-modal').style.display = 'none';
    if(useSaved) {
        seconds = _pendingRestore;
    } else {
        const val = document.getElementById('new-timer-input').value.split(':');
        seconds = (+val[0]*3600) + (+val[1]*60) + (+val[2]);
    }
    _pendingRestore = null;
    running = true; startClock();
}

// ═══════════════════════════════════════════════════════════
//  INSERT FEATURE
// ═══════════════════════════════════════════════════════════
function refreshTargetDropdowns() {
    ['math-target','draw-target','calc-target','snip-target'].forEach(selId => {
        const sel = document.getElementById(selId);
        if(!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';
        const blocks = document.querySelectorAll('#q-list .q-block');
        if(blocks.length === 0) { sel.innerHTML='<option value="">— No answer boxes yet —</option>'; return; }
        blocks.forEach(block => {
            const opt = document.createElement('option');
            opt.value = block.id;
            const li = block.querySelector('.q-label-input');
            const sl = block.querySelector('.block-header span');
            opt.text = li ? (li.value.trim() || '(Untitled)') : (sl ? sl.innerText : block.id);
            sel.appendChild(opt);
        });
        if(prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
    });
}

function openTool(id) {
    $(`#${id}`).fadeIn();
    refreshTargetDropdowns();
    if(id === 'draw-tool' && !_drawingToolLoaded) loadDrawingTool();
}
function closeTool(id) { $(`#${id}`).fadeOut(); }

function triggerInsert(iframeId, selectId) {
    const sel = document.getElementById(selectId);
    const targetId = sel ? sel.value : '';
    if(!targetId) return alert("Please add an answer box first.");
    const editable = document.querySelector(`#${targetId} .ans-editable`);
    if(!editable) return alert("Could not find the selected answer box.");
    const iframeEl = document.getElementById(iframeId);
    if(!iframeEl) return;
    const statusEl = document.getElementById(selectId.replace('-target','-status'));
    if(statusEl) { statusEl.style.display='inline'; statusEl.textContent='⏳ Capturing…'; }
    html2canvas(iframeEl, { useCORS:true, allowTaint:true, scale:1.5, logging:false })
        .then(canvas => {
            const img = `<img src="${canvas.toDataURL('image/png')}" style="max-width:100%;border:1px solid #ccc;margin-top:8px;display:block;">`;
            editable.focus();
            document.execCommand('insertHTML', false, img);
            saveWork();
            if(statusEl) { statusEl.textContent='✔ Inserted!'; setTimeout(()=>{statusEl.style.display='none';},2500); }
        })
        .catch(() => {
            if(statusEl) statusEl.style.display='none';
            openSnipModal(null, targetId);
            alert("Auto-screenshot blocked by browser (cross-origin). Use the Paste method.");
        });
}

function openSnipModal(autoId, fallbackId) {
    refreshTargetDropdowns();
    document.getElementById('snip-modal').style.display = 'flex';
    const pz = document.getElementById('snip-paste-zone');
    pz.innerHTML=''; pz.style.color='#999'; pz.innerText=pz.dataset.placeholder;
    const targetId = autoId || fallbackId;
    if(targetId) {
        const sel = document.getElementById('snip-target');
        if(sel && sel.querySelector(`option[value="block-${targetId}"]`)) sel.value=`block-${targetId}`;
        else if(sel && sel.querySelector(`option[value="${targetId}"]`)) sel.value=targetId;
    }
}

function closeSnipModal() { document.getElementById('snip-modal').style.display='none'; }

function insertFromSnipModal() {
    const sel = document.getElementById('snip-target');
    const targetId = sel ? sel.value : '';
    if(!targetId) return alert("Please add an answer box first.");
    const editable = document.querySelector(`#${targetId} .ans-editable`);
    if(!editable) return alert("Could not find the selected answer box.");
    const pz = document.getElementById('snip-paste-zone');
    const img = pz.querySelector('img');
    if(!img) return alert("No image found. Please paste a screenshot first.");
    const clone = img.cloneNode(true);
    clone.style.cssText = 'max-width:100%;border:1px solid #ccc;margin-top:8px;display:block;';
    editable.focus();
    document.execCommand('insertHTML', false, clone.outerHTML);
    saveWork();
    closeSnipModal();
}

// Lazy-load html2canvas
(function(){ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; document.head.appendChild(s); })();
