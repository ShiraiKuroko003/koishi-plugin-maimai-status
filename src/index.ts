
import { Context, h, Schema } from 'koishi'
import * as path from 'path'
import * as fs from 'fs'
import puppeteer from 'koishi-plugin-puppeteer'

export const name = 'maimai-status'

export const inject = ['puppeteer']

export interface Config {}  
export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  ctx.command('有网吗')
    .action(async ({ session }) => {
      const url = "https://status.awmc.cc/status/maimai"
      let page

      try {
        page = await ctx.puppeteer.page()
        
        // 构造字体文件路径
        const fontPath = path.resolve(__dirname, '../assets/msyh.ttf')
        
        let fontDataUrl = ''
        // 读取字体文件并转换为 Base64
        if (fs.existsSync(fontPath)) {
          const fontBuffer = fs.readFileSync(fontPath)
          const fontBase64 = fontBuffer.toString('base64')
          fontDataUrl = `data:font/ttf;base64,${fontBase64}`
          ctx.logger.info(`Font loaded: ${fontBuffer.length} bytes`)
        } else {
          ctx.logger.warn(`Font file not found at ${fontPath}`)
        }
        const PAGE_LOAD_TIMEOUT_MS = 30000
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        })

        // 注入字体样式
        await page.evaluate((fontUrl) => {
          const style = document.createElement('style')
            style.textContent = `
              @font-face {
                font-family: 'YaHei';
                src: url('${fontUrl}') format('truetype');
              }
              * {
                font-family: 'YaHei', 'Microsoft YaHei', 'SimHei', sans-serif !important;
              }
            `
          document.head.appendChild(style)
        }, fontDataUrl)

        await new Promise(resolve => setTimeout(resolve, 500))

        const buffer = await page.screenshot({
          fullPage: true,
        })

        // 发送图片
        await session.send(h.image(buffer, 'image/png'))
      } catch (err) {
        ctx.logger.error(err)
        return '截图失败，详见后台日志'
      } finally {
        if (page) await page.close()
      }
    })
}
