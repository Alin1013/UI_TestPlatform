// 运行时配置模块：集中校验目标地址、并发参数与 CI 状态，避免各模块读取不一致。
export interface RuntimeConfig {
  appBaseUrl: string;
  allowedHosts: string[];
  isCI: boolean;
  workers?: number;
}

/** 从进程环境生成安全的框架配置；未指定目标时使用本地演示应用而非任意外站。 */
export function loadRuntimeConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const configuredBaseUrl = environment.APP_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl || 'http://127.0.0.1:4173';
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error('APP_BASE_URL must be a valid absolute HTTP(S) URL.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('APP_BASE_URL must use HTTP or HTTPS.');
  }

  const allowedHosts = (environment.APP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  // 默认本地演示不需要额外配置；任何显式外部目标都必须通过主机 allowlist 防止误测生产。
  if (configuredBaseUrl && !isLocalDemo(parsedUrl) && !allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
    throw new Error('APP_BASE_URL host is not allowed; add its hostname to APP_ALLOWED_HOSTS.');
  }

  const workerValue = environment.PLAYWRIGHT_WORKERS?.trim();
  const workers = workerValue ? Number(workerValue) : undefined;
  if (workers !== undefined && (!Number.isInteger(workers) || workers < 1)) {
    throw new Error('PLAYWRIGHT_WORKERS must be a positive integer.');
  }

  return {
    appBaseUrl: parsedUrl.origin + parsedUrl.pathname.replace(/\/$/, ''),
    allowedHosts,
    isCI: Boolean(environment.CI),
    workers,
  };
}

/** 明确识别仓库内置演示地址；其他回环地址也需由使用者显式加入 allowlist。 */
function isLocalDemo(url: URL): boolean {
  return url.origin === 'http://127.0.0.1:4173';
}
