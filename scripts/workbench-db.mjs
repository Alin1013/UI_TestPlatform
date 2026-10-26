// PostgreSQL 数据访问层：集中管理工作台的用户、环境、用例和工作流，避免路由直接拼接 SQL。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pool;

/** 创建共享连接池；DATABASE_URL 缺失时直接报配置错误，不回退到文件存储。 */
export function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('缺少 DATABASE_URL，请先配置 PostgreSQL 连接串。');
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  pool.on('error', (error) => process.stderr.write(`PostgreSQL 连接池错误：${error.message}\n`));
  return pool;
}

/** 执行幂等迁移并初始化当前工作台用户及默认运行环境。 */
export async function initializeDatabase() {
  const client = await getPool().connect();
  try {
    await client.query(await readFile(path.join(root, 'db/001_workbench.sql'), 'utf8'));
    const email = process.env.WORKBENCH_USER_EMAIL?.trim() || 'alin@example.com';
    const displayName = process.env.WORKBENCH_USER_NAME?.trim() || 'Alin Li';
    const user = await client.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
       RETURNING id, email, display_name, role`,
      [email, displayName],
    );
    const baseUrl = process.env.APP_BASE_URL?.trim() || 'http://127.0.0.1:4173';
    const allowedHosts = (process.env.APP_ALLOWED_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean);
    await client.query(
      `INSERT INTO environments (name, base_url, allowed_hosts, workers, openai_base_url, midscene_model_name, is_default, created_by)
       SELECT '本地演示环境', $1, $2, $3, $4, $5, true, $6
       WHERE NOT EXISTS (SELECT 1 FROM environments WHERE created_by = $6 AND is_default = true)`,
      [baseUrl, allowedHosts, parseWorkers(process.env.PLAYWRIGHT_WORKERS), process.env.OPENAI_BASE_URL || null, process.env.MIDSCENE_MODEL_NAME || null, user.rows[0].id],
    );
    return user.rows[0];
  } finally {
    client.release();
  }
}

/** 将环境变量并发数转换为数据库可接受的正整数。 */
function parseWorkers(value) {
  if (!value?.trim()) return null;
  const workers = Number(value);
  return Number.isInteger(workers) && workers > 0 ? workers : null;
}

/** 获取当前用户及其环境列表，前端启动时使用该快照初始化选择器。 */
export async function getBootstrap(userId) {
  const database = getPool();
  const [user, environments] = await Promise.all([
    database.query('SELECT id, email, display_name, role FROM users WHERE id = $1', [userId]),
    database.query(`SELECT id, name, base_url, allowed_hosts, workers, openai_base_url, midscene_model_name, is_default, updated_at
                    FROM environments WHERE created_by = $1 ORDER BY is_default DESC, name`, [userId]),
  ]);
  return { user: user.rows[0], environments: environments.rows };
}

/** 保存运行环境配置；默认环境切换在同一事务中完成，保证始终最多一个默认项。 */
export async function saveEnvironment(userId, environment) {
  const database = getPool();
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    if (environment.is_default) await client.query('UPDATE environments SET is_default = false WHERE created_by = $1', [userId]);
    const result = await client.query(
      `INSERT INTO environments (id, name, base_url, allowed_hosts, workers, openai_base_url, midscene_model_name, is_default, created_by)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url,
         allowed_hosts = EXCLUDED.allowed_hosts, workers = EXCLUDED.workers, openai_base_url = EXCLUDED.openai_base_url,
         midscene_model_name = EXCLUDED.midscene_model_name, is_default = EXCLUDED.is_default, updated_at = now()
       WHERE environments.created_by = EXCLUDED.created_by
       RETURNING id, name, base_url, allowed_hosts, workers, openai_base_url, midscene_model_name, is_default, updated_at`,
      [environment.id || null, environment.name, environment.base_url, environment.allowed_hosts, environment.workers || null,
        environment.openai_base_url || null, environment.midscene_model_name || null, Boolean(environment.is_default), userId],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** 读取用户的规范化用例，并按步骤顺序还原为前端原有结构。 */
export async function listCases(userId) {
  const result = await getPool().query(
    `SELECT c.id, c.name, c.mode, c.prompt, c.updated_at,
            COALESCE(json_agg(json_build_object('action', s.action, 'selector', s.selector, 'value', s.value) ORDER BY s.step_order)
              FILTER (WHERE s.id IS NOT NULL), '[]') AS steps
     FROM test_cases c LEFT JOIN test_case_steps s ON s.case_id = c.id
     WHERE c.owner_id = $1 GROUP BY c.id ORDER BY c.updated_at DESC`, [userId],
  );
  return result.rows;
}

/** 以事务保存用例和步骤，旧步骤会被级联删除后按当前编辑顺序重建。 */
export async function saveCase(userId, testCase) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO test_cases (id, name, mode, prompt, owner_id) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, mode = EXCLUDED.mode, prompt = EXCLUDED.prompt, updated_at = now()
      WHERE test_cases.owner_id = EXCLUDED.owner_id`, [testCase.id, testCase.name, testCase.mode || 'manual', testCase.prompt || '', userId]);
    await client.query('DELETE FROM test_case_steps WHERE case_id = $1', [testCase.id]);
    for (const [index, step] of (testCase.steps || []).entries()) {
      await client.query('INSERT INTO test_case_steps (case_id, step_order, action, selector, value) VALUES ($1, $2, $3, $4, $5)',
        [testCase.id, index, step.action, step.selector || '', step.value || '']);
    }
    await client.query('COMMIT');
    return (await listCases(userId)).find((item) => item.id === testCase.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** 读取工作流及其有序用例引用。 */
export async function listWorkflows(userId) {
  const result = await getPool().query(
    `SELECT w.id, w.name, w.module,
            COALESCE(array_agg(wc.case_id ORDER BY wc.step_order) FILTER (WHERE wc.case_id IS NOT NULL), '{}') AS case_ids
     FROM workflows w LEFT JOIN workflow_cases wc ON wc.workflow_id = w.id
     WHERE w.owner_id = $1 GROUP BY w.id ORDER BY w.updated_at DESC`, [userId],
  );
  return result.rows.map((row) => ({ id: row.id, name: row.name, module: row.module, caseIds: row.case_ids }));
}

/** 以事务保存工作流及其有序关联，避免删除用例后留下半个工作流。 */
export async function saveWorkflow(userId, workflow) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO workflows (id, name, module, owner_id) VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, module = EXCLUDED.module, updated_at = now() WHERE workflows.owner_id = EXCLUDED.owner_id`,
      [workflow.id, workflow.name, workflow.module, userId]);
    await client.query('DELETE FROM workflow_cases WHERE workflow_id = $1', [workflow.id]);
    for (const [index, caseId] of workflow.caseIds.entries()) {
      await client.query('INSERT INTO workflow_cases (workflow_id, case_id, step_order) VALUES ($1, $2, $3)', [workflow.id, caseId, index]);
    }
    await client.query('COMMIT');
    return (await listWorkflows(userId)).find((item) => item.id === workflow.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** 根据 ID 批量读取已保存用例，运行器只使用数据库快照。 */
export async function findCases(userId, ids) {
  const cases = await listCases(userId);
  return ids.map((id) => cases.find((testCase) => testCase.id === id));
}
