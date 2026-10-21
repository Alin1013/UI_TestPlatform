// 本地演示服务为新项目提供无外部依赖的可运行目标，CI 与开发机共用相同页面契约。
import { createServer } from 'node:http';

const port = Number(process.env.DEMO_PORT || 4173);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Automation Demo</title></head>
<body><main><h1>Automation Demo Dashboard</h1><button type="button">Ready</button>
<table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>
<tr><td>2026-10-20</td><td>Completed</td></tr></tbody></table>
<output data-testid="page-indicator">Page 1</output>
<button type="button" aria-label="Next page" onclick="document.querySelector('tbody').innerHTML='<tr><td>2026-10-19</td><td>Pending</td></tr>';document.querySelector('[data-testid=page-indicator]').textContent='Page 2';this.disabled=true">Next page</button>
<iframe class="secure-vendor-frame" title="Secure vendor form" srcdoc="&lt;label&gt;Corporate email &lt;input id='corporate-email'&gt;&lt;/label&gt;"></iframe>
<canvas id="analytics-viewport" width="640" height="240" aria-label="Analytics chart"></canvas></main></body></html>`;

createServer((request, response) => {
  // 健康端点让 Playwright 管理服务生命周期时不依赖页面内容或外部探测地址。
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }

  response.writeHead(request.url === '/' || request.url === '/dashboard' ? 200 : 404, {
    'content-type': 'text/html; charset=utf-8',
  });
  response.end(request.url === '/' || request.url === '/dashboard' ? html : 'Not found');
}).listen(port, '127.0.0.1');
