/* SendGB 上传 —— 页面逻辑。
 * Node 能力全在 preload 的 window.services 里（这里不能 require）。
 */
const getAPI = () => (typeof window !== 'undefined' ? (window.ztools || window.utools || null) : null);
const API = getAPI();
const S = window.services || {};

const $ = (id) => document.getElementById(id);
const dropEl = $('drop'), filesEl = $('files'), barEl = $('bar'), pctEl = $('pct');
const statusEl = $('status'), linkEl = $('link'), copyBtn = $('btnCopy');
const logEl = $('log'), histEl = $('history'), notReady = $('notReady');

let uploading = false;

/* ---------------- 小工具 ---------------- */

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent += `[${t}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(msg) { statusEl.textContent = msg; }

function setProgress(p) {
  const v = Math.max(0, Math.min(100, p | 0));
  barEl.style.width = v + '%';
  pctEl.textContent = v + '%';
}

function blob(name, size) {
  return `${name}  ${S && S.human ? S.human(size) : size + ' B'}`;
}

/* ---------------- 环境检查 ---------------- */

function checkEnv(show) {
  const env = S.envReport ? S.envReport() : {};
  $('env').textContent = JSON.stringify(env, null, 2);
  if (!env.ready) {
    notReady.classList.remove('hidden');
    notReady.textContent = !env.browserOk
      ? '未检测到可用浏览器，请安装 Google Chrome 或启用系统自带的 Microsoft Edge。'
      : '插件组件不完整，请重新安装插件。';
  } else {
    notReady.classList.add('hidden');
  }
  if (show) log('环境检查：' + JSON.stringify(env));
  return env;
}

/* ---------------- 上传 ---------------- */

let currentUploadingFiles = [];

function startUpload(paths) {
  if (uploading) { setStatus('上一个上传还在进行中…'); return; }
  if (!paths || !paths.length) return;

  currentUploadingFiles = paths.slice();

  const env = checkEnv(false);
  if (!env.ready) { setStatus('上传引擎不可用，见上方提示'); return; }

  filesEl.classList.remove('hidden');
  filesEl.innerHTML = paths.map((p) => {
    const name = p.split(/[\\/]/).pop();
    return `<li><span>${name}</span><span class="sz">${p}</span></li>`;
  }).join('');

  uploading = true;
  copyBtn.disabled = true;
  linkEl.value = '';
  setProgress(0);
  setStatus(`准备上传 ${paths.length} 个文件…`);
  log('开始上传：' + paths.join(' ; '));

  const showWin = chkShowBrowser ? chkShowBrowser.checked : !!S.dbGet('sendgb:showBrowser');
  const ok = S.upload(paths, onEvent, { showBrowser: showWin });
  if (!ok) { uploading = false; setStatus('启动失败，见日志'); }
}

function onEvent(e) {
  if (!e) return;
  switch (e.t) {
    case 'progress':
      setProgress(e.p);
      setStatus(e.m || ('上传中 ' + e.p + '%'));
      break;
    case 'log':
      log(e.m);
      break;
    case 'done':
      uploading = false;
      setProgress(100);
      setStatus('上传完成，链接已复制');
      linkEl.value = e.link;
      copyBtn.disabled = false;
      S.copyText(e.link);
      const names = currentUploadingFiles.map((p) => p.split(/[\\/]/).pop()).filter(Boolean);
      const displayName = names.length > 1 ? `${names[0]} 等 ${names.length} 个文件` : (names[0] || '文件');
      const allNames = names.join(', ');
      addHistory(e.link, displayName, allNames);
      log('完成：' + e.link + (displayName ? ` [${displayName}]` : ''));
      break;
    case 'error':
      uploading = false;
      setStatus('失败：' + e.m);
      log('错误：' + e.m);
      break;
    case 'exit':
      uploading = false;
      if (e.code !== 0) log('执行器退出码 ' + e.code);
      break;
  }
}

/* ---------------- 历史 / 复制 / 删除 ---------------- */

let pendingDeleteLink = null;
const confirmModal = $('confirmModal');
const confirmMsg = $('confirmMsg');

function showConfirm(link) {
  pendingDeleteLink = link;
  const list = readHistory();
  const item = list.find((x) => x.link === link);
  const nameDesc = item && item.name && item.name !== '-' ? `<br>文件：<span style="color:var(--fg);font-weight:600;">${item.name}</span>` : '';
  confirmMsg.innerHTML = `确定要删除此条历史记录吗？${nameDesc}<br><span style="color:var(--muted);font-family:monospace;font-size:11px;">${link}</span>`;
  confirmModal.classList.remove('hidden');
}

function hideConfirm() {
  pendingDeleteLink = null;
  confirmModal.classList.add('hidden');
}

function removeHistory(link) {
  const list = readHistory().filter((x) => x.link !== link);
  S.dbSet('sendgb:history', list);
  renderHistory();
  setStatus('已删除历史记录');
  log('已删除历史记录：' + link);
}

$('btnConfirmCancel').addEventListener('click', hideConfirm);
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) hideConfirm();
});

$('btnConfirmOk').addEventListener('click', () => {
  if (pendingDeleteLink) {
    const link = pendingDeleteLink;
    hideConfirm();
    removeHistory(link);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmModal.classList.contains('hidden')) {
    hideConfirm();
  }
});

function readHistory() { return S.dbGet('sendgb:history') || []; }

function addHistory(link, name, fullNames) {
  const list = readHistory().filter((x) => x.link !== link);
  list.unshift({
    link,
    name: name || '文件',
    fullNames: fullNames || name || '文件',
    at: Date.now()
  });
  S.dbSet('sendgb:history', list.slice(0, 50));
  renderHistory();
}

function renderHistory() {
  const list = readHistory();
  if (!list.length) {
    histEl.innerHTML = '<li style="color:var(--muted);cursor:default;justify-content:center;padding:12px;">还没有历史记录</li>';
    return;
  }
  histEl.innerHTML = list.map((x) => {
    const d = new Date(x.at);
    const fileName = x.name || '-';
    const fullNames = x.fullNames || fileName;
    return `<li data-link="${x.link}">
      <span class="col-link" title="${x.link}">${x.link}</span>
      <span class="col-name" title="${fullNames}">${fileName}</span>
      <span class="col-time" title="${d.toLocaleString()}">${d.toLocaleString()}</span>
      <span class="col-action"><button class="btn-del" data-del="${x.link}" title="删除此记录">删除</button></span>
    </li>`;
  }).join('');
}

histEl.addEventListener('click', (ev) => {
  const delBtn = ev.target.closest('.btn-del');
  if (delBtn) {
    ev.stopPropagation();
    const link = delBtn.getAttribute('data-del');
    if (link) showConfirm(link);
    return;
  }

  const li = ev.target.closest('li[data-link]');
  if (!li) return;
  const link = li.getAttribute('data-link');
  linkEl.value = link;
  copyBtn.disabled = false;
  S.copyText(link);
  setStatus('已复制历史链接');
  log('从历史复制：' + link);
});

copyBtn.addEventListener('click', () => {
  if (!linkEl.value) return;
  S.copyText(linkEl.value);
  setStatus('已复制');
});

/* ---------------- 选择 / 拖放 ---------------- */

dropEl.addEventListener('click', () => {
  const files = S.pickFiles();
  if (files && files.length) startUpload(files);
});

['dragenter', 'dragover'].forEach((t) =>
  dropEl.addEventListener(t, (e) => { e.preventDefault(); dropEl.classList.add('on'); })
);
['dragleave', 'drop'].forEach((t) =>
  dropEl.addEventListener(t, (e) => { e.preventDefault(); dropEl.classList.remove('on'); })
);
dropEl.addEventListener('drop', (e) => {
  const paths = [];
  const dt = e.dataTransfer;
  if (dt && dt.files) {
    for (const f of dt.files) {
      const p = f.path || (API && API.getPathForFile ? API.getPathForFile(f) : null);
      if (p) paths.push(p);
    }
  }
  if (paths.length) startUpload(paths);
  else {
    setStatus('没拿到文件路径，请改用「点击选择」，或把文件拖到 ZTools 主搜索框');
    log('拖放未拿到路径（uTools/ZTools 限制），请用 files 匹配指令：主搜索框拖文件 → 选“用 SendGB 上传”');
  }
});

/* ---------------- 标签页 / 设置 ---------------- */

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.getAttribute('data-tab');
    ['history', 'log', 'settings'].forEach((n) =>
      $('panel-' + n).classList.toggle('hidden', n !== name)
    );
  });
});

$('btnSettings').addEventListener('click', () => {
  const tab = [...document.querySelectorAll('.tab')].find((t) => t.getAttribute('data-tab') === 'settings');
  tab.click();
  checkEnv(true);
});

const chkShowBrowser = $('chkShowBrowser');
if (chkShowBrowser) {
  chkShowBrowser.checked = !!S.dbGet('sendgb:showBrowser');
  chkShowBrowser.addEventListener('change', () => {
    S.dbSet('sendgb:showBrowser', chkShowBrowser.checked);
    log(chkShowBrowser.checked ? '设置更新：上传时【显示浏览器窗口】' : '设置更新：上传时【后台静默运行】');
  });
}

$('btnEnv').addEventListener('click', () => checkEnv(true));

$('btnKill').addEventListener('click', () => {
  const killFn = S.killStrayBrowser || S.killStrayChrome;
  if (killFn) {
    killFn((n) => {
      log('已清理残留浏览器进程（Chrome / Edge）：' + n + ' 个');
      setStatus(n ? `已清理 ${n} 个残留浏览器进程` : '当前没有残留的浏览器进程');
    });
  }
});

$('btnCancel').addEventListener('click', () => {
  if (S.cancel()) {
    uploading = false;
    setStatus('已中止（若浏览器还开着，点「清理残留浏览器」）');
    log('用户中止上传');
  }
});

/* ---------------- 进入插件的启动参数 ---------------- */

function handleEnter(info) {
  const api = getAPI();
  if (api && api.setExpendHeight) {
    try { api.setExpendHeight(560); } catch (e) {}
  }
  if (!info) return;
  checkEnv(false);
  if (info.files && info.files.length) {
    startUpload(info.files);
  } else {
    setStatus(info.text ? `收到文本「${info.text}」，请点选择或拖文件` : '等待文件');
  }
}

window.__onEnter = handleEnter;
if (window.__pendingEnter) { handleEnter(window.__pendingEnter); window.__pendingEnter = null; }

/* ---------------- 初始化 ---------------- */

renderHistory();
checkEnv(false);
const api = getAPI();
if (api && api.setExpendHeight) {
  try { api.setExpendHeight(560); } catch (e) {}
}
log('插件已就绪');
