
import { Context, h, Schema, sleep } from 'koishi'
import * as path from 'path'
import * as fs from 'fs'
import puppeteer from 'koishi-plugin-puppeteer'

export const name = 'maimai-status'

export const inject = ['puppeteer']

export interface Config {}  
export const Config: Schema<Config> = Schema.object({})

// 进程内缓存，5分钟内复用截图
let lastScreenshot: Buffer | null = null
let lastFetchedAt: number | null = null

export function apply(ctx: Context) {
  // 插件启动时初始化缓存目录
  const cacheDir = path.resolve(ctx.baseDir, 'cache/maimai-status')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
    ctx.logger.info(`Created cache directory: ${cacheDir}`)
  }

  ctx.command('有网吗')
    .action(async ({ session }) => {
      const url = "https://status.awmc.cc/status/maimai"
      const USER_AGENT = 'koishiMaiBot Status Check'
      const EXTRA_HEADERS = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
      }
      let page
      try {
        page = await ctx.puppeteer.page();
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          (window as any).chrome = { runtime: {} };
          const originalQuery = window.navigator.permissions.query;
          window.navigator.permissions.query = (parameters: any) => (
            parameters.name === 'notifications' 
              ? Promise.resolve({ state: 'denied' } as PermissionStatus)
              : originalQuery(parameters)
          );
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
          });
          Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en']
          });
        })
        await page.setUserAgent(USER_AGENT)
        await page.setExtraHTTPHeaders(EXTRA_HEADERS)
        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 })
        
        // 构造字体文件路径
        const fontPath = path.resolve(__dirname, '../assets/msyh.ttf')
        
        // 构造图片缓存路径，降低状态服务器压力
        const cacheFile = path.resolve(ctx.baseDir, 'cache/maimai-status/maimai-status.png')
        
        let fontDataUrl = ''

        // 若缓存仍在 5 分钟内，直接返回缓存
        if (lastScreenshot && lastFetchedAt && Date.now() - lastFetchedAt < 5 * 60 * 1000) {
          await session.send(h.image(lastScreenshot, 'image/png'))
          return
        }

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


        await page.setDefaultNavigationTimeout(PAGE_LOAD_TIMEOUT_MS)
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        })

        sleep(3);

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
          path: cacheFile,
        })

        // 更新缓存
        lastScreenshot = buffer
        lastFetchedAt = Date.now()
        try {
          fs.writeFileSync(cacheFile, buffer)
        } catch (writeErr) {
          ctx.logger.warn(`Failed to write cache file: ${writeErr}`)
        }

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
