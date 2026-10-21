// AI 套件必须在浏览器启动前拒绝缺少凭据/模型配置，避免“绿色但未执行”的 CI 结果。
import dotenv from 'dotenv';

// Playwright 配置尚未加载时先读本地 .env，保证 AI 入口和框架主入口使用一致的配置来源。
dotenv.config();

const missing = ['OPENAI_API_KEY', 'MIDSCENE_MODEL_NAME'].filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(`AI test configuration is incomplete: ${missing.join(', ')}.`);
  process.exit(1);
}
