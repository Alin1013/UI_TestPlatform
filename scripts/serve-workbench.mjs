// 本地用例工作台服务：通过 PostgreSQL 持久化业务数据，并提供固定的 Playwright 执行入口。
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  findCases,
  getBootstrap,
  initializeDatabase,
  listCases,
  listWorkflows,
  saveCase,
  saveEnvironment,
  saveWorkflow,
} from './workbench-db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.WORKBENCH_PORT || 4174);
let activeRun = null;
let currentUser;

// 工作台服务启动时统一读取本地数据库和运行环境配置，避免只在 Playwright 进程中加载 .env。
dotenv.config({ path: path.join(root, '.env') });

/** 仅接受受限工作流结构，且所有引用必须属于当前用户已保存的用例。 */
function validateWorkflow(workflow, cases) {
  return Boolean(workflow
    && typeof workflow.id === 'string' && /^[a-z0-9-]{1,64}$/.test(workflow.id)
    && typeof workflow.name === 'string' && workflow.name.trim() && workflow.name.length <= 120
    && typeof workflow.module === 'string' && workflow.module.trim() && workflow.module.length <= 60
    && Array.isArray(workflow.caseIds) && workflow.caseIds.length >= 2 && workflow.caseIds.length <= 30
    && new Set(workflow.caseIds).size === workflow.caseIds.length
    && workflow.caseIds.every((id) => cases.some((testCase) => testCase.id === id)));
}

/** 校验手工步骤或语义步骤；两种模式共用同一个数据库用例表。 */
function validateCase(testCase) {
  if (!testCase || typeof testCase.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(testCase.id)) return false;
  if (typeof testCase.name !== 'string' || !testCase.name.trim() || testCase.name.length > 120) return false;
  if (testCase.mode === 'semantic') return typeof testCase.prompt === 'string' && Boolean(testCase.prompt.trim()) && testCase.prompt.length <= 4000;
  if (testCase.mode && testCase.mode !== 'manual') return false;
  const allowed = new Set(['goto', 'click', 'fill', 'assertVisible', 'assertText']);
  return Array.isArray(testCase.steps) && testCase.steps.length >= 1 && testCase.steps.length <= 30
    && testCase.steps.every((step) => allowed.has(step?.action)
      && typeof step.value === 'string' && step.value.length <= 2000
      && (step.action !== 'goto' || /^\/(?!\/)/.test(step.value))
      && (step.action === 'goto' || (typeof step.selector === 'string' && step.selector.length <= 500)));
}

/** 校验前端可编辑的环境配置；API key 仍只保留在服务端进程环境。 */
function validateEnvironment(environment) {
  return Boolean(environment
    && (!environment.id || /^[0-9a-f-]{36}$/i.test(environment.id))
    && typeof environment.name === 'string' && environment.name.trim() && environment.name.length <= 80
    && typeof environment.base_url === 'string' && /^https?:\/\/[^\s]+$/i.test(environment.base_url)
    && Array.isArray(environment.allowed_hosts) && environment.allowed_hosts.every((host) => typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host))
    && (environment.workers === null || environment.workers === undefined || (Number.isInteger(environment.workers) && environment.workers > 0))
    && (!environment.openai_base_url || /^https?:\/\/[^\s]+$/i.test(environment.openai_base_url))
    && (!environment.midscene_model_name || environment.midscene_model_name.length <= 120));
}

/** 发送 JSON 响应，统一 API 的编码和错误格式。 */
function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

/** 限制请求体大小，避免本地工作台被异常大请求占满内存。 */
async function requestJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65_536) throw new Error('请求内容过大');
  }
  return JSON.parse(body || '{}');
}

/** 使用所选环境执行一批数据库快照用例，并串行锁住工作台执行资源。 */
function runCases(testCases, environment) {
  if (activeRun) return Promise.resolve({ busy: true, output: '已有用例正在执行，请稍后重试。' });
  if (testCases.some((testCase) => testCase.mode === 'semantic')) {
    const missing = ['OPENAI_API_KEY', 'MIDSCENE_MODEL_NAME'].filter((name) => !process.env[name]?.trim());
    if (missing.length) return Promise.resolve({ passed: false, output: `语义用例缺少模型配置：${missing.join(', ')}。请在 .env 中设置后重启工作台。` });
  }
  const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'test', 'tests/workbench-case.spec.ts', '--project=workbench'], {
      cwd: root,
      // 环境配置来自数据库；密钥只从服务端进程继承，绝不经浏览器提交。
      env: {
        ...process.env,
        APP_BASE_URL: environment.base_url,
        APP_ALLOWED_HOSTS: (environment.allowed_hosts || []).join(','),
        PLAYWRIGHT_WORKERS: environment.workers ? String(environment.workers) : '',
        OPENAI_BASE_URL: environment.openai_base_url || process.env.OPENAI_BASE_URL || '',
        MIDSCENE_MODEL_NAME: environment.midscene_model_name || process.env.MIDSCENE_MODEL_NAME || '',
        PLAYWRIGHT_CASE_IDS: JSON.stringify(testCases.map((testCase) => testCase.id)),
        // 将已从 PostgreSQL 读取的不可变快照传给 Playwright 子进程，避免测试进程绕过当前用户边界再次查询。
        PLAYWRIGHT_CASES_JSON: JSON.stringify(testCases),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeRun = child;
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => { activeRun = null; resolve({ passed: false, output: `无法启动测试：${error.message}` }); });
    child.on('close', (code) => { activeRun = null; resolve({ passed: code === 0, output: output.slice(-12_000) }); });
  });
}

/** 读取页面、报告或 API；所有业务数据接口都走 PostgreSQL 数据访问层。 */
async function handleRequest(request, response) {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
    sendJson(response, 200, await getBootstrap(currentUser.id)); return;
  }
  if (request.method === 'GET' && url.pathname === '/api/cases') {
    sendJson(response, 200, { cases: await listCases(currentUser.id) }); return;
  }
  if (request.method === 'POST' && url.pathname === '/api/cases') {
    const testCase = await requestJson(request);
    if (!validateCase(testCase)) { sendJson(response, 400, { error: '用例格式不正确，或步骤超过 30 个。' }); return; }
    await saveCase(currentUser.id, testCase);
    sendJson(response, 200, { cases: await listCases(currentUser.id) }); return;
  }
  if (request.method === 'POST' && url.pathname === '/api/environments') {
    const environment = await requestJson(request);
    if (!validateEnvironment(environment)) { sendJson(response, 400, { error: '环境配置不正确，请检查名称、地址和并发数。' }); return; }
    await saveEnvironment(currentUser.id, environment);
    sendJson(response, 200, await getBootstrap(currentUser.id)); return;
  }
  if (request.method === 'GET' && url.pathname === '/api/workflows') {
    sendJson(response, 200, { workflows: await listWorkflows(currentUser.id) }); return;
  }
  if (request.method === 'POST' && url.pathname === '/api/workflows') {
    const workflow = await requestJson(request); const cases = await listCases(currentUser.id);
    if (!validateWorkflow(workflow, cases)) { sendJson(response, 400, { error: '工作流格式不正确，请检查分类和用例选择。' }); return; }
    await saveWorkflow(currentUser.id, workflow);
    sendJson(response, 200, { workflows: await listWorkflows(currentUser.id) }); return;
  }
  if (request.method === 'POST' && url.pathname === '/api/run') {
    const payload = await requestJson(request); const ids = Array.isArray(payload.ids) ? payload.ids : [payload.id];
    if (!ids.length || ids.length > 30 || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) { sendJson(response, 400, { error: '请选择 1 到 30 个不重复的用例。' }); return; }
    const testCases = await findCases(currentUser.id, ids);
    if (testCases.some((testCase) => !testCase)) { sendJson(response, 404, { error: '组合中有用例已不存在，请刷新后重试。' }); return; }
    const environments = (await getBootstrap(currentUser.id)).environments;
    const environment = environments.find((item) => item.id === payload.environmentId) || environments.find((item) => item.is_default);
    if (!environment) { sendJson(response, 400, { error: '没有可用的运行环境，请先在运行设置中保存。' }); return; }
    const result = await runCases(testCases, environment); sendJson(response, result.busy ? 409 : 200, result); return;
  }
  if (request.method === 'GET' && (['/', '/index.html', '/cases', '/workflows', '/storage', '/reports', '/settings'].includes(url.pathname)
    || /^\/cases\/edit\/(?:new|[a-z0-9-]+)$/.test(url.pathname))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(await readFile(path.join(root, 'public', 'workbench.html'))); return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/report/')) {
    const relative = path.normalize(url.pathname.slice('/report/'.length)); const reportFile = path.resolve(root, 'playwright-report', relative);
    if (!reportFile.startsWith(`${path.resolve(root, 'playwright-report')}${path.sep}`)) { response.writeHead(403).end('Forbidden'); return; }
    const content = await readFile(reportFile); const type = reportFile.endsWith('.js') ? 'text/javascript' : reportFile.endsWith('.css') ? 'text/css' : 'text/html';
    response.writeHead(200, { 'content-type': `${type}; charset=utf-8` }); response.end(content); return;
  }
  response.writeHead(404).end('Not found');
}

async function start() {
  currentUser = await initializeDatabase();
  createServer(async (request, response) => {
    try { await handleRequest(request, response); }
    catch (error) { sendJson(response, 500, { error: error.message || '工作台请求失败' }); }
  }).listen(port, '127.0.0.1', () => process.stdout.write(`用例工作台已启动：http://127.0.0.1:${port}\n`));
}

start().catch((error) => { process.stderr.write(`工作台启动失败：${error.message}\n`); process.exitCode = 1; });
