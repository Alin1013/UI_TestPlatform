// 数据库迁移入口：显式初始化 PostgreSQL 表结构，便于本地、CI 和部署脚本复用。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initializeDatabase, getPool, saveCase, saveWorkflow } from './workbench-db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 迁移命令独立于 Playwright 配置运行，因此需要在访问数据库前显式加载仓库根目录的 .env。
dotenv.config({ path: path.join(root, '.env') });

/** 将旧版本的本地 JSON 一次性导入 PostgreSQL；文件不存在时直接跳过。 */
async function readLegacy(fileName) {
  try { return JSON.parse(await readFile(path.join(root, fileName), 'utf8')); }
  catch (error) { return error.code === 'ENOENT' ? [] : Promise.reject(error); }
}

try {
  const user = await initializeDatabase();
  const cases = await readLegacy('.local-test-cases.json');
  for (const testCase of cases) await saveCase(user.id, testCase);
  const workflows = await readLegacy('.local-test-workflows.json');
  for (const workflow of workflows) await saveWorkflow(user.id, workflow);
  if (cases.length || workflows.length) process.stdout.write(`已迁移旧本地数据：${cases.length} 个用例，${workflows.length} 个工作流。\n`);
  process.stdout.write(`PostgreSQL 初始化完成，工作台用户：${user.email}\n`);
  await getPool().end();
} catch (error) {
  process.stderr.write(`PostgreSQL 初始化失败：${error.message}\n`);
  process.exitCode = 1;
}
