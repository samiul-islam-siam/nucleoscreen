/* ─── Config ─────────────────────────────────────────────────────────────── */
const SCREENS = {
    '16x2': { width: 16, height: 2, panelWidth: 5 },
    /* add new sizes here, e.g.: '20x4': { width: 20, height: 4, panelWidth: 4 } */
};

let cfg = { ...SCREENS['16x2'] };
let activeSegments = [];

/* ─── State ───────────────────────────────────────────────────────────────── */
let isDark = true;   /* dark mode by default */
let funcOnly = true;   /* function-only mode by default */

/* ─── Undo / Redo ─────────────────────────────────────────────────────────── */
let undoStack = [];
let redoStack = [];

function snapshotBefore() {
    const state = {};
    for (let i = 0; i < cfg.width * cfg.height; i++) {
        state[i] = readGrid(i);
    }
    undoStack.push(state);
    redoStack = [];           
}

function restoreSnapshot(state) {
    activeSegments = [];   
    for (const [i, bits] of Object.entries(state)) {
        writeGrid(Number(i), bits);
        if (bits.includes('1')) activeSegments.push(Number(i));
        const segment = $('canvas').children[i];
        if (!segment) continue;
        [...segment.querySelectorAll('.pixel')].forEach((px, j) => {
            px.classList.toggle('active', bits[j] === '1');
        });
    }
    refreshCursorCode();
    refreshCgramCounter();  
}

function undo() {
    if (!undoStack.length) return;
    const current = {};
    for (let i = 0; i < cfg.width * cfg.height; i++) current[i] = readGrid(i);
    redoStack.push(current);
    restoreSnapshot(undoStack.pop());
}

function redo() {
    if (!redoStack.length) return;
    const current = {};
    for (let i = 0; i < cfg.width * cfg.height; i++) current[i] = readGrid(i);
    undoStack.push(current);
    restoreSnapshot(redoStack.pop());
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

function binaryGridToHex(bits) {
    const rows = bits.match(/.{1,5}/g) || [];
    return rows.map(r => {
        const val = parseInt(r, 2);
        return '0x' + val.toString(16).toUpperCase().padStart(2, '0');
    });
}

function readGrid(i) {
    const span = $(`seg${i}`);
    if (!span) return '0'.repeat(40);
    return span.dataset.raw
        .split(',')
        .map(h => parseInt(h.trim(), 16).toString(2).padStart(5, '0'))
        .join('');
}

function writeGrid(i, bits) {
    let span = $(`seg${i}`);
    const hexes = binaryGridToHex(bits);
    const label = i < 9 ? `image0${i + 1}` : `image${i + 1}`;
    const code = `uint8_t ${label}[8] = {${hexes.join(', ')}};\n        `;

    if (!span) {
        span = document.createElement('span');
        span.id = `seg${i}`;
        $('bytes').appendChild(span);
    }
    span.dataset.raw = hexes.join(', ');
    span.innerText = code;

    if (hexes.every(h => parseInt(h, 16) === 0)) {
        span.remove();
        activeSegments = activeSegments.filter(x => x !== i);
    }
}

function downloadCanvasPng() {
    function doCapture() {
        html2canvas($('canvas'), {
            backgroundColor: null,
            scale: 4
        }).then(c => {
            const a = document.createElement('a');
            a.href     = c.toDataURL('image/png');
            a.download = 'lcd-glyph.png';
            a.click();
        });
    }

    if (window.html2canvas) {
        doCapture();
    } else {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = doCapture;
        document.head.appendChild(s);
    }
}

/* ─── Code panel ──────────────────────────────────────────────────────────── */
function refreshCursorCode() {
    $('createChar').innerText = '';
    $('setCursor').innerText = '';
    const spans = $('bytes').querySelectorAll('[id^="seg"]');
    if (!spans.length) return;
    const indices = [...spans].map(s => parseInt(s.id.replace('seg', '')));
    indices.forEach((segIdx, slot) => {
        const col = segIdx % cfg.width;
        const row = Math.floor(segIdx / cfg.width);
        const label = segIdx < 9 ? `image0${segIdx + 1}` : `image${segIdx + 1}`;
        $('createChar').innerText +=
            `Lcd_define_char(&lcd, ${slot}, ${label});\n        `;
        $('setCursor').innerText +=
            `Lcd_cursor(&lcd, ${row}, ${col});\n        Lcd_write_char(&lcd, ${slot});\n        `;
    });
}

function refreshCgramCounter() {
    const used = activeSegments.length;
    const el = $('cgramCount');
    if (el) el.textContent = `${used} / 8`;

}

function popoutCode() {
    const I = '    ';   // 4 spaces = one indent level, matches code panel visual
    let out = '';

    // ── setup block (full code mode) ──
    const setup = $('setup');
    if (setup && setup.innerText.trim()) {
        out += setup.innerText.trim() + '\n\n';
    }

    // ── function open ──
    out += 'void image() {\n';

    // ── Lcd_clear ──
    out += `${I}Lcd_clear(&lcd);\n\n`;

    // ── byte arrays ──
    const byteSpans = $('bytes').querySelectorAll('[id^="seg"]');
    byteSpans.forEach(s => {
        const segIdx = parseInt(s.id.replace('seg', ''));
        const label  = segIdx < 9 ? `image0${segIdx + 1}` : `image${segIdx + 1}`;
        const hexes  = s.dataset.raw.split(',').map(h => h.trim());
        out += `${I}uint8_t ${label}[8] = {${hexes.join(', ')}};\n`;
    });

    if (byteSpans.length) out += '\n';

    // ── Lcd_define_char calls ──
    const segIndices = [...byteSpans].map(s => parseInt(s.id.replace('seg', '')));
    segIndices.forEach((segIdx, slot) => {
        const label = segIdx < 9 ? `image0${segIdx + 1}` : `image${segIdx + 1}`;
        out += `${I}Lcd_define_char(&lcd, ${slot}, ${label});\n`;
    });

    if (segIndices.length) out += '\n';

    // ── Lcd_cursor + Lcd_write_char calls ──
    segIndices.forEach((segIdx, slot) => {
        const col = segIdx % cfg.width;
        const row = Math.floor(segIdx / cfg.width);
        out += `${I}Lcd_cursor(&lcd, ${row}, ${col});\n`;
        out += `${I}Lcd_write_char(&lcd, ${slot});\n`;
    });

    // ── function close ──
    out += '}';

    $('codeModalContent').textContent = out;
    $('codeModalOverlay').classList.add('open');
}

function closeCodeModal() {
    $('codeModalOverlay').classList.remove('open');
}

function applyCodeMode() {
    const setup = $('setup');
    if (funcOnly) {
        setup.innerText = '';
    } else {
        setup.innerText =
            `#include "main.h"
#include "lcd.h"

void SystemClock_Config(void);
void GPIO_Init(void);

Lcd_HandleTypeDef lcd;
void image(void);

int main(void) {
    SystemClock_Config();
    GPIO_Init();

    Lcd_PortType ports[] = { GPIOC, GPIOB, GPIOA, GPIOA };
    Lcd_PinType  pins[]  = { GPIO_PIN_7, GPIO_PIN_6, GPIO_PIN_7, GPIO_PIN_6 };

    lcd = Lcd_create(ports, pins,
                     GPIOB, GPIO_PIN_5,   /* RS */
                     GPIOB, GPIO_PIN_4,   /* EN */
                     LCD_4_BIT_MODE);

    image();
    while (1) {}
}

`;
    }
}

/* ─── Pixel toggle ────────────────────────────────────────────────────────── */
function togglePixel(segIdx, pixelIdx, pixelEl) {
    $('copyAlert').style.opacity = 0;
    if (!activeSegments.includes(segIdx) && activeSegments.length >= 8) 
    {
        const warn = $('cgramAlert');
        if (warn && warn.style.opacity !== '1') {
            warn.style.opacity = 1;
            setTimeout(() => { warn.style.opacity = 0; }, 2000);
        }
        return;
    
    }
    if (!activeSegments.includes(segIdx)) activeSegments.push(segIdx);

    const arr = readGrid(segIdx).split('');
    arr[pixelIdx] = arr[pixelIdx] === '0' ? '1' : '0';
    pixelEl.classList.toggle('active', arr[pixelIdx] === '1');

    writeGrid(segIdx, arr.join(''));
    refreshCursorCode();
    refreshCgramCounter();   
}

/* ─── Generate canvas ─────────────────────────────────────────────────────── */
function generateSegments() {
    activeSegments = [];
    $('createChar').innerHTML = '';
    $('setCursor').innerHTML = '';
    $('canvas').innerHTML = '';
    $('bytes').innerHTML = '';
    refreshCgramCounter();  

    const pw = cfg.panelWidth;
    const gap = pw / 5;

    const canvasVw = cfg.width * (pw + gap) + gap;
    $('canvas').style.width = `${canvasVw}vw`;
    $('canvas').style.padding = `${gap / 2}vw`;

    for (let i = 0; i < cfg.width * cfg.height; i++) {
        const segment = document.createElement('div');
        segment.className = 'panel';
        segment.style.width = `${pw}vw`;
        segment.style.height = `${8 * pw / 5}vw`;
        segment.style.margin = `${gap / 2}vw`;

        for (let j = 0; j < 40; j++) {
            const pixel = document.createElement('div');
            pixel.className = 'pixel';
            pixel.style.width = `${pw / 5}vw`;
            pixel.style.height = `${pw / 5}vw`;
            pixel.addEventListener('mousedown', () => {
                snapshotBefore();                        
                togglePixel(i, j, pixel);
            });
            pixel.addEventListener('mouseenter', (e) => { if (e.buttons === 1) togglePixel(i, j, pixel); });
            segment.appendChild(pixel);
        }
        document.onkeydown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
            if (e.key === 'Escape') closeCodeModal();
        };
        $('canvas').appendChild(segment);
    }
}

/* ─── Theme ───────────────────────────────────────────────────────────────── */
function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    $('themeBtn').textContent = isDark ? '☀ light' : '☾ dark';
}

function toggleTheme() {
    isDark = !isDark;
    applyTheme();
}

/* ─── Code mode ───────────────────────────────────────────────────────────── */
function toggleCodeMode(btn) {
    funcOnly = !funcOnly;
    btn.textContent = funcOnly ? 'full code' : 'func only';
    applyCodeMode();
}

/* ─── Public actions ──────────────────────────────────────────────────────── */
function setScreen(key) {
    cfg = { ...SCREENS[key] };
    $('copyAlert').style.opacity = 0;
    undoStack = [];
    redoStack = [];
    generateSegments();
    flashEraseAlert();
}

function eraseScreen() {
    undoStack = [];
    redoStack = [];
    generateSegments();
    flashEraseAlert();
}

function copyCode() {
    const bitmap = $('bitmap');
    bitmap.style.whiteSpace = 'pre-line';
    $('dummy').value = bitmap.innerText.trim().replace(/\n\n/gm, '\n');
    $('dummy').select();
    document.execCommand('copy');
    bitmap.style.whiteSpace = 'nowrap';
    $('copyAlert').style.opacity = 1;
    setTimeout(() => { $('copyAlert').style.opacity = 0; }, 2000);
}

function flashEraseAlert() {
    const el = $('eraseAlert');
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0.35; }, 1400);
}

/* ─── Init ────────────────────────────────────────────────────────────────── */
window.onload = () => {
    applyTheme();
    applyCodeMode();
    generateSegments();
};