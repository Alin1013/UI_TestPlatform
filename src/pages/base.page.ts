// 页面模型基类：把确定性 Playwright 操作与按需调用的 Midscene 能力放在同一页面上下文。
import type { Page } from '@playwright/test';
import { PlaywrightAgent, type PageAgent } from '@midscene/web';

type MidscenePageAgent = Pick<PageAgent, 'aiAssert' | 'aiQuery'>;

/** 为页面模型共享浏览器页面，并在确有视觉操作时创建 Midscene 适配器。 */
export abstract class BasePage {
  protected readonly page: Page;
  private aiAgent?: MidscenePageAgent;

  /** 页面与视觉代理共享同一个 Playwright 页面上下文。 */
  protected constructor(page: Page) {
    this.page = page;
  }

  /** 纯 DOM 场景不构造模型客户端，从生命周期上隔离 AI 配置和调用。 */
  protected get ai(): MidscenePageAgent {
    // 部分 Midscene 版本未在专用类型上声明这些方法，因此只暴露页面模型实际使用的稳定能力。
    this.aiAgent ??= new PlaywrightAgent(this.page) as unknown as MidscenePageAgent;
    return this.aiAgent;
  }
}
