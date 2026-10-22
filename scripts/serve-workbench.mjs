// 本地用例工作台服务：提供受限的用例读写与固定 Playwright 执行入口。
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.WORKBENCH_PORT || 4174);
const casesPath = path.join(root, '.local-test-cases.json');
let activeRun = null;

/** 读取本机保存的用例；首次运行返回空集合，避免覆盖使用者已有数据。 */
async function readCases() {
  try {
    return JSON.parse(await readFile(casesPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/** 仅接受工作台支持的步骤类型，并限制步骤数和字段大小。 */
function validateCase(testCase) {
  const allowed = new Set(['goto', 'click', 'fill', 'assertVisible', 'assertText']);
  if (!testCase || typeof testCase.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(testCase.id)) return false;
  if (typeof testCase.name !== 'string' || !testCase.name.trim() || testCase.name.length > 120) return false;
  if (!Array.isArray(testCase.steps) || testCase.steps.length < 1 || testCase.steps.length > 30) return false;
  return testCase.steps.every((step) => allowed.has(step?.action)
    && typeof step.value === 'string' && step.value.length <= 2000
    // 工作台只接受站点内路径，避免用例绕过 APP_ALLOWED_HOSTS 跳转到任意外部主机。
    && (step.action !== 'goto' || /^\/(?!\/)/.test(step.value))
    && (step.action === 'goto' || (typeof step.selector === 'string' && step.selector.length <= 500)));
}

/** 响应 JSON API 请求，错误信息保持简短且不泄露进程环境。 */
function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

/** 将请求体限制在 64 KiB，避免本地服务被意外的大请求拖垮。 */
async function requestJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65_536) throw new Error('请求内容过大');
  }
  return JSON.parse(body || '{}');
}

/** 启动固定测试文件并把结果回传给工作台；同时只允许一个执行进程。 */
function runCase(testCase) {
  if (activeRun) return Promise.resolve({ busy: true, output: '已有用例正在执行，请稍后重试。' });
  const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'test', 'tests/workbench-case.spec.ts', '--project=workbench'], {
      cwd: root,
      env: { ...process.env, PLAYWRIGHT_CASE_ID: testCase.id },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeRun = child;
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => {
      activeRun = null;
      resolve({ passed: false, output: `无法启动测试：${error.message}` });
    });
    child.on('close', (code) => {
      activeRun = null;
      resolve({ passed: code === 0, output: output.slice(-12_000) });
    });
  });
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (request.method === 'GET' && url.pathname === '/api/cases') {
      sendJson(response, 200, { cases: await readCases() });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/cases') {
      const testCase = await requestJson(request);
      if (!validateCase(testCase)) {
        sendJson(response, 400, { error: '用例格式不正确，或步骤超过 30 个。' });
        return;
      }
      const cases = await readCases();
      const existing = cases.findIndex((item) => item.id === testCase.id);
      if (existing >= 0) cases[existing] = testCase;
      else cases.push(testCase);
      await writeFile(casesPath, `${JSON.stringify(cases, null, 2)}\n`, 'utf8');
      sendJson(response, 200, { cases });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/run') {
      const { id } = await requestJson(request);
      const testCase = (await readCases()).find((item) => item.id === id);
      if (!testCase) {
        sendJson(response, 404, { error: '找不到该用例，请先保存。' });
        return;
      }
      const result = await runCase(testCase);
      sendJson(response, result.busy ? 409 : 200, result);
      return;
    }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(await readFile(path.join(root, 'public', 'workbench.html')));
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/report/')) {
      const relative = path.normalize(url.pathname.slice('/report/'.length));
      const reportFile = path.resolve(root, 'playwright-report', relative);
      if (!reportFile.startsWith(`${path.resolve(root, 'playwright-report')}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const content = await readFile(reportFile);
      const type = reportFile.endsWith('.js') ? 'text/javascript' : reportFile.endsWith('.css') ? 'text/css' : 'text/html';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
      response.end(content);
      return;
    }
    response.writeHead(404).end('Not found');
  } catch (error) {
    sendJson(response, 500, { error: error.message || '工作台请求失败' });
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`用例工作台已启动：http://127.0.0.1:${port}\n`);
});
