import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chromium } from 'playwright';

const port = Number(process.env.PORT || 8080);
const maxSessions = Math.min(200, Math.max(1, Number(process.env.MAX_SESSIONS || 200)));
const host = process.env.HOST || '127.0.0.1';
const secret = process.env.PANEL_KEY || randomBytes(24).toString('base64url');
const panel = await readFile(new URL('./public/index.html', import.meta.url));
const entries = new Map();
let browser;
let job = null;
let startPromise = null;
let sequence = 0;

if (!process.env.PANEL_KEY) console.log('Konsol anahtarı:', secret);
if (secret.length < 24) throw new Error('PANEL_KEY en az 24 karakter olmalı.');
const equal = (a, b) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
function json(res, code, data) {
  const bytes = Buffer.from(JSON.stringify(data));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(bytes);
}
async function bodyOf(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 80000) throw Error('Veri çok büyük.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function videoId(link) {
  const url = new URL(link);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw Error('Geçerli bir YouTube bağlantısı gir.');
  const hostname = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let id;
  if (hostname === 'youtu.be' && parts.length === 1) id = parts[0];
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    if (parts.length === 2 && ['shorts', 'live', 'embed'].includes(parts[0])) id = parts[1];
  }
  if (!/^[\w-]{11}$/.test(id || '')) throw Error('Geçerli bir YouTube video linki gir.');
  return id;
}
function parseProxy(line) {
  let input = line.trim();
  if (!input.includes('://')) {
    const parts = input.split(':');
    if (parts.length !== 4 || !parts.every(Boolean)) throw Error('Bağlantı satırı IP:port:kullanıcı:şifre biçiminde olmalı.');
    const [hostname, port, username, password] = parts;
    input = 'http://' + encodeURIComponent(username) + ':' + encodeURIComponent(password) + '@' + hostname + ':' + port;
  }
  const url = new URL(input);
  if (!['http:', 'https:', 'socks5:'].includes(url.protocol) || !url.hostname || !url.port || url.pathname !== '/' || url.search || url.hash) {
    throw Error('Bağlantı satırları IP:port:kullanıcı:şifre veya HTTP proxy adresi biçiminde olmalı.');
  }
  const proxy = { server: url.protocol + '//' + url.hostname + ':' + url.port };
  if (url.username) proxy.username = decodeURIComponent(url.username);
  if (url.password) proxy.password = decodeURIComponent(url.password);
  if (url.protocol === 'socks5:' && (proxy.username || proxy.password)) throw Error('Kimlik doğrulamalı SOCKS5 desteklenmiyor. HTTP proxy kullan.');
  return proxy;
}
async function pool(items, limit, worker) {
  let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }));
}
async function start(link, lines, count) {
  if (job || entries.size) throw Error('Önce mevcut oturumları kapat.');
  const id = videoId(link);
  if (!Number.isInteger(count) || count < 1 || count > maxSessions) throw Error('Bu sunucuda oturum sayısı 1–' + maxSessions + ' arasında olmalı.');
  const proxies = lines.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (proxies.length < count) throw Error('Her oturum için ayrı bir bağlantı satırı gir.');
  const parsed = proxies.slice(0, count).map(parseProxy);
  job = {cancelled: false, total: count, done: 0};
  const activeJob = job;
  for (let i = 0; i < count; i++) entries.set(i + 1, {id: i + 1, state: 'Bekliyor', ip: '', context: null, page: null});
  try {
    browser = await chromium.launch({headless: true});
    if (activeJob.cancelled) { await browser.close(); browser = null; return; }
    await pool(parsed.map((proxy, i) => ({proxy, entry: entries.get(i + 1)})), 4, async ({proxy, entry}) => {
      if (activeJob.cancelled) { entry.state = 'İptal edildi'; activeJob.done++; return; }
      try {
        entry.state = 'IP kontrol ediliyor';
        entry.context = await browser.newContext({proxy, viewport: {width: 1280, height: 720}, locale: 'tr-TR'});
        const result = await entry.context.request.get('https://api.ipify.org?format=json', {timeout: 15000});
        if (!result.ok()) throw Error('IP sorgusu başarısız.');
        const data = await result.json();
        if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(data.ip || '')) throw Error('IPv4 doğrulanamadı.');
        if ([...entries.values()].some(other => other !== entry && other.ip === data.ip)) throw Error('Aynı çıkış IP’si başka oturumda kullanılıyor.');
        entry.ip = data.ip;
        if (activeJob.cancelled) { await entry.context.close(); entry.context = null; entry.state = 'İptal edildi'; return; }
        entry.state = 'Video açılıyor';
        entry.page = await entry.context.newPage();
        await entry.page.goto('https://www.youtube.com/watch?v=' + id, {waitUntil: 'domcontentloaded', timeout: 35000});
        if (activeJob.cancelled) { await entry.context.close(); entry.context = null; entry.state = 'İptal edildi'; return; }
        const video = entry.page.locator('video').first();
        if (await video.count()) {
          const result = await video.evaluate(v => v.play().then(() => 'Oynuyor').catch(() => 'Oynatmaya izin verilmedi'));
          entry.state = result;
        } else entry.state = 'Oynatıcı yüklenmedi veya onay bekliyor';
      } catch (error) {
        entry.state = 'Hata: ' + String(error.message).replace(/https?:\/\/[^\s]+/g, '[adres]').slice(0, 160);
        if (entry.context) await entry.context.close().catch(() => {});
        entry.context = null;
        entry.page = null;
      } finally { activeJob.done++; }
    });
  } catch (error) {
    for (const entry of entries.values()) if (entry.state === 'Bekliyor') entry.state = 'Hata: Tarayıcı başlatılamadı';
    console.error('Tarayıcı başlatılamadı:', error.message);
  } finally { if (job === activeJob) job = null; }
}
async function command(action, ids) {
  const targets = [...entries.values()].filter(e => e.page && (ids === 'all' || ids.includes(e.id)));
  await pool(targets, 8, async entry => {
    try {
      const video = entry.page.locator('video').first();
      if (action === 'play') {
        const result = await video.evaluate(v => v.play().then(() => true).catch(() => false));
        entry.state = result ? 'Oynuyor' : 'Oynatmaya izin verilmedi';
      } else if (action === 'pause') {
        await video.evaluate(v => v.pause());
        entry.state = 'Duraklatıldı';
      } else if (action === 'forward' || action === 'rewind') {
        await video.evaluate((v, seconds) => { v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + seconds)); }, action === 'forward' ? 10 : -10);
      }
    } catch { entry.state = 'Oynatıcı komutu uygulanamadı'; }
  });
}
async function stopAll() {
  const old = job;
  if (old) old.cancelled = true;
  const closingBrowser = browser;
  if (closingBrowser) await closingBrowser.close().catch(() => {});
  if (startPromise) await startPromise.catch(() => {});
  browser = null;
  entries.clear();
  if (job === old) job = null;
}
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Content-Length': panel.length, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}); res.end(panel); return;
    }
    if (!equal(req.headers.authorization || '', 'Bearer ' + secret)) return json(res, 401, {error: 'Konsol anahtarı yanlış.'});
    if (req.method === 'GET' && path === '/api/status') return json(res, 200, {maxSessions, job: job && {total: job.total, done: job.done}, entries: [...entries.values()].map(({id, state, ip}) => ({id, state, ip}))});
    if (req.method === 'GET' && /^\/api\/screen\/\d+$/.test(path)) {
      const entry = entries.get(Number(path.split('/').pop()));
      if (!entry?.page) return json(res, 404, {error: 'Ekran bulunamadı.'});
      const png = await entry.page.screenshot({type: 'jpeg', quality: 55, timeout: 6000});
      res.writeHead(200, {'Content-Type': 'image/jpeg', 'Content-Length': png.length, 'Cache-Control': 'no-store'}); res.end(png); return;
    }
    if (req.method === 'POST' && path === '/api/start') {
      const data = await bodyOf(req);
      if (typeof data.url !== 'string' || typeof data.proxies !== 'string') throw Error('Link ve bağlantılar gerekli.');
      if (job || entries.size) throw Error('Önce mevcut oturumları kapat.');
      const id = ++sequence;
      videoId(data.url);
      const count = Number(data.count);
      if (!Number.isInteger(count) || count < 1 || count > maxSessions) throw Error('Bu sunucuda oturum sayısı 1–' + maxSessions + ' arasında olmalı.');
      const proxies = data.proxies.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (proxies.length < count) throw Error('Her oturum için ayrı bir bağlantı satırı gir.');
      proxies.slice(0, count).forEach(parseProxy);
      startPromise = start(data.url, data.proxies, count).catch(error => {
        console.error('İşlem hatası:', error.message);
      }).finally(() => { startPromise = null; });
      return json(res, 202, {ok: true, id});
    }
    if (req.method === 'POST' && path === '/api/command') {
      const data = await bodyOf(req);
      if (!['play', 'pause', 'forward', 'rewind'].includes(data.action) || !(data.ids === 'all' || Array.isArray(data.ids))) throw Error('Komut geçersiz.');
      await command(data.action, data.ids);
      return json(res, 200, {ok: true});
    }
    if (req.method === 'POST' && path === '/api/stop') { await stopAll(); return json(res, 200, {ok: true}); }
    return json(res, 404, {error: 'İşlem bulunamadı.'});
  } catch (error) { return json(res, 400, {error: String(error.message).slice(0, 250)}); }
});
server.listen(port, host, () => console.log('Konsol dinleniyor:', host, port));
process.on('SIGTERM', () => { stopAll().finally(() => server.close()); });
