const element = id => document.getElementById(id);
const start = element('start');
const focus = element('focus');
const fullscreen = element('fullscreen');
const exit = element('exit');
const status = element('status');
const progress = element('progress');
let instance = null;
let busy = false;
let runtimeReady = false;
let runtimeError = false;
let canvas = element('game');
let loadingTimer;
let loadingExpired = false;

function suspend() {
  if (instance && runtimeReady) instance.SendMessage('WebPlaytestBridge', 'Suspend', '');
}
window.addEventListener('jiebagame-status', event => {
  if (loadingExpired) return;
  runtimeReady = event.detail?.state === 'ready';
  runtimeError = event.detail?.state === 'error';
  if (typeof event.detail?.message === 'string') status.textContent = event.detail.message;
  if (runtimeReady || runtimeError) clearTimeout(loadingTimer);
});
function bindCanvas() {
  canvas.addEventListener('blur', suspend);
  canvas.addEventListener('keydown', event => {
    if (!event.ctrlKey && !event.metaKey && !event.altKey
        && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
}
bindCanvas();
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });

function localUrl(path) {
  if (typeof path !== 'string' || path.includes('..') || /[\\:%?#]/.test(path) || path.startsWith('/'))
    throw new Error('试玩资源路径无效');
  return new URL(path, document.baseURI).href;
}

async function loadScript(url) {
  if (window.createUnityInstance) return;
  const script = document.createElement('script');
  script.src = url;
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('游戏加载器下载失败，请重试')); };
    document.head.append(script);
  });
}

start.addEventListener('click', async () => {
  if (busy || instance) return;
  busy = true;
  runtimeReady = runtimeError = false;
  start.disabled = true;
  progress.hidden = false;
  progress.value = 0;
  status.textContent = '正在载入试玩…';
  loadingExpired = false;
  loadingTimer = setTimeout(() => {
    loadingExpired = true;
    progress.hidden = true;
    status.textContent = '载入超时，可能是网络或浏览器初始化失败。请刷新页面后重试；建议使用桌面版 Chrome 或 Edge。';
  }, 120000);
  try {
    if (!document.createElement('canvas').getContext('webgl2')) throw new Error('此浏览器无法启用 WebGL 2，请使用支持硬件加速的桌面版 Chrome 或 Edge。');
    const response = await fetch('./web-build.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('试玩资源下载失败，请检查网络并刷新页面重试');
    const build = await response.json();
    const config = {
      dataUrl: localUrl(build.dataUrl), frameworkUrl: localUrl(build.frameworkUrl),
      codeUrl: localUrl(build.codeUrl), streamingAssetsUrl: localUrl('StreamingAssets'),
      companyName: 'Jiebagame', productName: 'JiebagameWeb01', productVersion: 'Web01',
      showBanner: (message, type) => {
        if (type === 'error') { status.textContent = `游戏运行错误：${message}。请刷新页面重试。`; progress.hidden = true; clearTimeout(loadingTimer); }
        else console.warn(message);
      },
    };
    await loadScript(localUrl(build.loaderUrl));
    instance = await window.createUnityInstance(canvas, config, value => {
      if (loadingExpired) return;
      progress.value = value;
      status.textContent = `正在载入试玩… ${Math.round(value * 100)}%`;
    });
    if (loadingExpired) { await instance.Quit(); instance = null; return; }
    focus.disabled = fullscreen.disabled = exit.disabled = false;
    if (!runtimeReady && !runtimeError) status.textContent = '引擎已载入，正在准备演示清单…';
    canvas.focus();
  } catch (error) {
    clearTimeout(loadingTimer);
    status.textContent = error instanceof Error ? error.message : String(error);
    start.disabled = loadingExpired;
  } finally { busy = false; progress.hidden = true; }
});
focus.addEventListener('click', () => canvas.focus());
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await element('stage').requestFullscreen();
    canvas.focus();
  } catch { status.textContent = '浏览器未允许全屏，可以继续使用窗口模式。'; }
});
exit.addEventListener('click', async () => {
  if (!instance || busy) return;
  busy = true;
  suspend();
  focus.disabled = fullscreen.disabled = exit.disabled = true;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    await instance.Quit();
    instance = null;
    runtimeReady = runtimeError = false;
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
    bindCanvas();
    start.disabled = false;
    start.focus();
    status.textContent = '已退出试玩，游戏资源已释放。';
  } catch (error) {
    status.textContent = `退出未完成，请刷新页面：${String(error)}`;
  } finally { busy = false; }
});
