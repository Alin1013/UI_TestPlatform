// 页面模型基类：把确定性 Playwright 操作与按需调用的 Midscene 能力放在同一页面上下文。
import type { Page } from '@playwright/test';
import { PlaywrightAgent, type PageAgent } from '@midscene/web';

type MidscenePageAgent = Pick<PageAgent, 'aiAssert' | 'aiQuery'>;

/** 为页面模型持有浏览器页面及其 Midscene 适配器。 */
export abstract class BasePage {
  protected readonly page: Page;
  protected readonly ai: MidscenePageAgent;

  /** 页面与视觉代理共享同一个 Playwright 页面上下文。 */
  protected constructor(page: Page) {
    this.page = page;
    // 专用 Playwright 类型在部分 Midscene 版本中未继承公开方法声明；公共 Agent 接口是稳定的运行时边界。
    this.ai = new PlaywrightAgent(page) as unknown as MidscenePageAgent;
  }

}
