// 示例仪表盘页面模型：稳定交互优先用 DOM/坐标，AI 仅处理视觉判断和非结构化抽取。
import type { Page } from '@playwright/test';
import { BasePage } from './base.page';

/** 面向示例仪表盘的混合式页面操作封装。 */
export class DashboardPage extends BasePage {
  /** 页面模型使用公开构造器，使测试可直接从 Playwright 页面创建实例。 */
  constructor(page: Page) {
    super(page);
  }

  /** 将相对画布坐标映射到当前可见画布位置，避免页面尺寸变化破坏点击目标。 */
  async selectCanvasChartSegment(xOffsetPct: number, yOffsetPct: number): Promise<void> {
    // 拒绝超出归一化比例范围的坐标，防止错误参数把点击发到画布之外。
    if (![xOffsetPct, yOffsetPct].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new RangeError('Canvas offsets must be finite numbers between 0 and 1.');
    }

    const canvas = this.page.locator('canvas#analytics-viewport');
    await canvas.waitFor({ state: 'visible' });
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas is visible but has no measurable bounding box.');
    }

    await this.page.mouse.click(
      box.x + box.width * xOffsetPct,
      box.y + box.height * yOffsetPct,
    );
  }

  /** 通过 Playwright frameLocator 访问跨域 iframe 中的标准表单控件。 */
  async fillSecureIframeForm(email: string): Promise<void> {
    const secureFrame = this.page.frameLocator('iframe.secure-vendor-frame');
    await secureFrame.locator('input#corporate-email').fill(email);
  }

  /** 把非结构化视觉布局交给 Midscene 判断，避免脆弱地绑定卡片排版细节。 */
  async verifyDashboardState(): Promise<void> {
    await this.ai.aiAssert(
      'The main data chart displays trends without overlapping text, and the top metric cards show green positive arrows.',
    );
  }

  /** 从语义化 HTML 表格读取当前页数据，避免模型在确定性数据上产生幻觉。 */
  async getTransactionRows(): Promise<Array<{ date: string; status: string }>> {
    return this.page.locator('table tbody tr').evaluateAll((rows) =>
      rows.map((row) => {
        const cells = row.querySelectorAll('td');
        return {
          date: cells[0]?.textContent?.trim() ?? '',
          status: cells[1]?.textContent?.trim() ?? '',
        };
      }).filter((row) => row.date.length > 0 && row.status.length > 0),
    );
  }
}
