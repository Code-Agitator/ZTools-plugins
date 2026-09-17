/* SendGB 上传 —— ZTools preload（CommonJS，可用 Node/Electron 能力）
 *
 * 作用：
 *   1) 提供 window.services：选文件、起 Python 上传引擎、读配置、清理残留 Chrome
 *   2) 把 ztools.onPluginEnter 的启动参数（拖进来的文件）转给页面
 *
 * 兼容 ZTools(window.ztools) 与 uTools(window.utools)
 */
const { spawn, execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// 统一获取宿主 API（ZTools 优先，兼容 uTools）
function getAPI() {
  if (typeof window !== 'undefined') {
    return window.ztools || window.utools || null;
  }
  return null;
}

if (typeof window !== 'undefined') {
  if (!window.utools && window.ztools) {
    window.utools = window.ztools;
  } else if (!window.ztools && window.utools) {
    window.ztools = window.utools;
  }
}

const PLUGIN_DIR = __dirname;
const PROFILE_DIR = path.join(
  process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : 'C:\\Temp'),
  'sendgb-uploader',
  'chrome-profile'
);
const MAX_TOTAL_BYTES = 5 * 1024 * 1024 * 1024; // sendgb 免费单次 5GB

let current = null; // 正在跑的上传子进程

function dbGet(key) {
  try {
    const api = getAPI();
    if (api && api.dbStorage) return api.dbStorage.getItem(key);
  } catch (e) {}
  return undefined;
}
function dbSet(key, val) {
  try {
    const api = getAPI();
    if (api && api.dbStorage) api.dbStorage.setItem(key, val);
  } catch (e) {}
}

function queryAppPath(exeName) {
  if (process.platform !== 'win32') return null;
  for (const root of ['HKLM', 'HKCU']) {
    try {
      const out = execFileSync(
        'reg',
        ['query', root + '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\' + exeName, '/ve'],
        { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
      );
      const lines = out.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/REG_SZ\s+(.*)/i);
        if (m && m[1]) {
          const p = m[1].trim();
          if (fs.existsSync(p)) return p;
        }
      }
    } catch (e) {}
  }
  return null;
}

function detectBrowser() {
  const force = (process.env.SENDGB_FORCE_BROWSER || '').toLowerCase();

  const getEdge = () => {
    const edgeAppPath = queryAppPath('msedge.exe');
    if (edgeAppPath) return { name: 'Microsoft Edge (系统自带)', channel: 'msedge', path: edgeAppPath };
    const edgeList = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ];
    for (const p of edgeList) {
      if (p && fs.existsSync(p)) return { name: 'Microsoft Edge (系统自带)', channel: 'msedge', path: p };
    }
    return null;
  };

  const getChrome = () => {
    const chromeAppPath = queryAppPath('chrome.exe');
    if (chromeAppPath) return { name: 'Google Chrome', channel: 'chrome', path: chromeAppPath };
    const chromeList = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ];
    for (const p of chromeList) {
      if (p && fs.existsSync(p)) return { name: 'Google Chrome', channel: 'chrome', path: p };
    }
    return null;
  };

  if (force === 'edge') return getEdge();
  if (force === 'chrome') return getChrome();

  return getChrome() || getEdge();
}

function getNodeBin() {
  // 1. 首选 ZTools/uTools 内置宿主执行器（配合 ELECTRON_RUN_AS_NODE=1，新电脑完全无需安装 Node.js！）
  if (process && process.execPath && fs.existsSync(process.execPath)) {
    return { bin: process.execPath, isElectron: true };
  }
  // 2. 候选系统中独立安装的 node.exe
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    'node'
  ];
  for (const p of candidates) {
    if (p === 'node' || fs.existsSync(p)) return { bin: p, isElectron: false };
  }
  return { bin: 'node', isElectron: false };
}

function envReport() {
  const browser = detectBrowser();
  const runner = path.join(PLUGIN_DIR, 'bin', 'runner.js');
  const nodeInfo = getNodeBin();
  return {
    engine: nodeInfo.isElectron ? 'ZTools 内置 Node 引擎 (免安装)' : '系统 Node (' + nodeInfo.bin + ')',
    browser: browser ? browser.name : '未检测到（需 Chrome 或 Edge）',
    browserPath: browser ? browser.path : null,
    browserOk: !!browser,
    profileDir: PROFILE_DIR,
    ready: !!(browser && fs.existsSync(runner))
  };
}

function pickFiles() {
  const api = getAPI();
  if (!api || !api.showOpenDialog) return [];
  const r = api.showOpenDialog({
    title: '选择要上传的文件',
    properties: ['openFile', 'multiSelections']
  });
  return Array.isArray(r) ? r : [];
}

function human(n) {
  const u = [['GB', 1073741824], ['MB', 1048576], ['KB', 1024]];
  for (const [name, div] of u) if (n >= div) return (n / div).toFixed(2) + ' ' + name;
  return n + ' B';
}

/* 起上传：onEvent(obj) 会被逐条调用，obj 形如 {t:'log'|'progress'|'done'|'error', ...} */
function upload(files, onEvent, opts = {}) {
  const browser = detectBrowser();
  if (!browser) {
    onEvent({ t: 'error', m: '未检测到可用浏览器，请安装 Google Chrome 或启用系统自带的 Microsoft Edge' });
    return false;
  }
  const list = (files || []).filter((f) => f && fs.existsSync(f) && fs.statSync(f).isFile());
  if (!list.length) {
    onEvent({ t: 'error', m: '没有可上传的文件' });
    return false;
  }
  let total = 0;
  for (const f of list) total += fs.statSync(f).size;
  if (total > MAX_TOTAL_BYTES) {
    onEvent({ t: 'error', m: `合计 ${human(total)}，超过 sendgb 免费单次 5GB 上限` });
    return false;
  }
  if (current) {
    onEvent({ t: 'error', m: '上一个上传还在进行中' });
    return false;
  }

  const showWin = opts && opts.showBrowser !== undefined ? !!opts.showBrowser : !!dbGet('sendgb:showBrowser');
  const runner = path.join(PLUGIN_DIR, 'bin', 'runner.js');
  const nodeInfo = getNodeBin();
  const env = Object.assign({}, process.env, {
    SENDGB_PROFILE_DIR: PROFILE_DIR,
    SENDGB_SHOW_BROWSER: showWin ? '1' : '0'
  });
  if (nodeInfo.isElectron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  const child = spawn(nodeInfo.bin, [runner].concat(list), { env, windowsHide: true });
  current = child;

  child.on('error', (err) => {
    current = null;
    onEvent({ t: 'error', m: `启动执行引擎失败 (${err.message})` });
  });

  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line));
      } catch (e) {
        onEvent({ t: 'log', m: line });
      }
    }
  });
  child.stderr.on('data', (d) => onEvent({ t: 'log', m: '[stderr] ' + d.toString('utf8').trim().slice(0, 400) }));
  child.on('close', (code) => {
    current = null;
    onEvent({ t: 'exit', code });
  });
  return true;
}

function cancel() {
  if (!current) return false;
  try {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(current.pid), '/T', '/F'], () => {});
    } else {
      current.kill('SIGKILL');
    }
  } catch (e) {}
  current = null;
  return true;
}

/* 清理残留的后台浏览器进程（Chrome / Edge），避免占用 profile 单例锁 */
function killStrayBrowser(cb) {
  if (process.platform !== 'win32') return cb(0);
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*sendgb-uploader*' -or $_.CommandLine -like '*chrome-profile*' -or $_.CommandLine -like '*browser-profile*' } | " +
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Output 1 }";
  execFile('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true }, (err, stdout) => {
    const n = String(stdout || '').trim().split(/\s+/).filter(Boolean).length;
    if (n) {
      ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'].forEach((f) => {
        try { fs.rmSync(path.join(PROFILE_DIR, f), { force: true }); } catch (e) {}
      });
    }
    if (typeof cb === 'function') cb(n);
  });
}

function copyText(t) {
  try {
    const api = getAPI();
    if (api && api.copyText) return api.copyText(t);
  } catch (e) {}
  return false;
}

/* ---------------- 启动参数转发 ---------------- */

function normalizePayload(param) {
  // 拖进来的文件：可能是 ['C:\\a.txt'] 也可能是 [{path:'C:\\a.txt', isFile:true}]
  const out = { type: param && param.type, code: param && param.code, text: '', files: [] };
  if (!param) return out;
  const p = param.payload;
  const arr = Array.isArray(p) ? p : [p];
  for (const item of arr) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (fs.existsSync(item)) out.files.push(item);
      else out.text += item + ' ';
    } else if (typeof item === 'object') {
      const f = item.path || item.filePath;
      if (f) { try { if (fs.statSync(f).isFile()) out.files.push(f); } catch (e) {} }
    }
  }
  out.text = out.text.trim();
  return out;
}

const api = getAPI();
if (api && api.onPluginEnter) {
  api.onPluginEnter((param) => {
    const info = normalizePayload(param);
    if (typeof window.__onEnter === 'function') {
      try { window.__onEnter(info); } catch (e) {}
    } else {
      window.__pendingEnter = info;
    }
  });
}

window.services = {
  envReport,
  pickFiles,
  upload,
  cancel,
  killStrayBrowser,
  killStrayChrome: killStrayBrowser,
  copyText,
  profileDir: PROFILE_DIR,
  dbGet, dbSet,
  pluginDir: PLUGIN_DIR,
  human
};
