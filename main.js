/* ─── Config ─────────────────────────────────────────────────────────────── */
const SCREENS = {
    '16x2': { width: 16, height: 2, panelWidth: 5 },
    /* add new sizes here, e.g.: '20x4': { width: 20, height: 4, panelWidth: 4 } */
};

let cfg = { ...SCREENS['16x2'] };
let activeSegments = [];

/* ─── State ───────────────────────────────────────────────────────────────── */
let isDark      = true;   /* dark mode by default */
let funcOnly    = true;   /* function-only mode by default */

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
    const hexes  = binaryGridToHex(bits);
    const label  = i < 9 ? `image0${i + 1}` : `image${i + 1}`;
    const code   = `uint8_t ${label}[8] = {${hexes.join(', ')}};\n        `;

    if (!span) {
        span = document.createElement('span');
        span.id = `seg${i}`;
        $('bytes').appendChild(span);
    }
    span.dataset.raw = hexes.join(', ');
    span.innerText   = code;

    if (hexes.every(h => parseInt(h, 16) === 0)) {
        span.remove();
        activeSegments = activeSegments.filter(x => x !== i);
    }
}

/* ─── Code panel ──────────────────────────────────────────────────────────── */
function refreshCursorCode() {
    $('createChar').innerText = '';
    $('setCursor').innerText  = '';
    const spans   = $('bytes').querySelectorAll('[id^="seg"]');
    if (!spans.length) return;
    const indices = [...spans].map(s => parseInt(s.id.replace('seg', '')));
    indices.forEach((segIdx, slot) => {
        const col   = segIdx % cfg.width;
        const row   = Math.floor(segIdx / cfg.width);
        const label = segIdx < 9 ? `image0${segIdx + 1}` : `image${segIdx + 1}`;
        $('createChar').innerText +=
            `Lcd_define_char(&lcd, ${slot}, ${label});\n        `;
        $('setCursor').innerText  +=
            `Lcd_cursor(&lcd, ${row}, ${col});\n        Lcd_write_char(&lcd, ${slot});\n        `;
    });
}

function applyCodeMode() {
    const setup = $('setup');
    if (funcOnly) {
        setup.innerText = '';
    } else {
        setup.innerText =
`#include "lcd.h"

Lcd_HandleTypeDef lcd;

void image(void);

int main(void) {
    /* peripheral init (clocks, GPIO) goes here */

    Lcd_PortType dataPorts[8] = { /* your data ports */ };
    Lcd_PinType  dataPins[8]  = { /* your data pins  */ };

    lcd = Lcd_create(dataPorts, dataPins,                                                                                                       
                     GPIOB, GPIO_PIN_0,   /* RS */
                     GPIOB, GPIO_PIN_1,   /* EN */
                     LCD_8_BIT_MODE);

    image();
    while (1) {}
}

`;
    }
}

/* ─── Pixel toggle ────────────────────────────────────────────────────────── */
function togglePixel(segIdx, pixelIdx, pixelEl) {
    $('copyAlert').style.opacity = 0;
    if (!activeSegments.includes(segIdx) && activeSegments.length >= 8) return;
    if (!activeSegments.includes(segIdx)) activeSegments.push(segIdx);

    const arr = readGrid(segIdx).split('');
    arr[pixelIdx] = arr[pixelIdx] === '0' ? '1' : '0';
    pixelEl.classList.toggle('active', arr[pixelIdx] === '1');

    writeGrid(segIdx, arr.join(''));
    refreshCursorCode();
}

/* ─── Generate canvas ─────────────────────────────────────────────────────── */
function generateSegments() {
    activeSegments = [];
    $('createChar').innerHTML = '';
    $('setCursor').innerHTML  = '';
    $('canvas').innerHTML     = '';
    $('bytes').innerHTML      = '';

    const pw  = cfg.panelWidth;
    const gap = pw / 5; 

    const canvasVw = cfg.width * (pw + gap) + gap;
    $('canvas').style.width   = `${canvasVw}vw`;
    $('canvas').style.padding = `${gap / 2}vw`;

    for (let i = 0; i < cfg.width * cfg.height; i++) {
        const segment = document.createElement('div');
        segment.className    = 'panel';
        segment.style.width  = `${pw}vw`;
        segment.style.height = `${8 * pw / 5}vw`;
        segment.style.margin = `${gap / 2}vw`;

        for (let j = 0; j < 40; j++) {
            const pixel = document.createElement('div');
            pixel.className    = 'pixel';
            pixel.style.width  = `${pw / 5}vw`;
            pixel.style.height = `${pw / 5}vw`;
            pixel.addEventListener('click',      ()  => togglePixel(i, j, pixel));
            pixel.addEventListener('mouseenter', (e) => { if (e.buttons === 1) togglePixel(i, j, pixel); });
            segment.appendChild(pixel);
        }
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
    generateSegments();
    flashEraseAlert();
}

function eraseScreen() {
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