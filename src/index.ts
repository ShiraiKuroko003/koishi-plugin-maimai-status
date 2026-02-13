
import { Context, h, Schema} from 'koishi'
import * as path from 'path'
import * as fs from 'fs'


export const name = 'maimai-status'

export const inject = ['puppeteer']

export interface Config {
  cacheTime: number
  sendText: boolean
}  
export const Config: Schema<Config> = Schema.object({
  cacheTime: Schema.number().default(5).description('图片缓存时间 (分钟)'),
  sendText: Schema.boolean().default(true).description('是否默认发送文字版播报')
})

// 进程内缓存，设置分钟内复用截图
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
      if (ctx.config.sendText) {
        try {
          const response = await ctx.http.get('https://api.shiraikuroko.top/maimai-status/',{
            timeout: 5000
          })

          const { data, lastUpdate } = response
          const entries = Object.entries(data)

          if (entries.length === 0) {
            return '当前没有获取到任何服务器状态数据，请注意及时更新插件或者检查网络喵~'
          }

          // ctx.logger.info(response)

          const isOnline = Object.values(data).every((info:any) => info.status === 'UP')

          const statusList = Object.entries(response.data).map(([name,info]) => {
            const icon = info.status ==='UP' ? '✅' : '❌'
            return `${icon} ${name} (${info.ping}ms)`
          });

          // ctx.logger.info(`上次更新时间：${response.lastUpdate}`);
          // ctx.logger.info(statusList);

          const sendStatus = [
            ...statusList,
            '',
            `更新时间：${lastUpdate || '未知'}`,
          ].join('\n')

          const img = path.resolve(__dirname, isOnline ? '../assets/green.png' : '../assets/gray.png')
          await session.send([
            h.image(fs.readFileSync(img),'image/png'),
            h.text(sendStatus)
          ])
        
        } catch (err) {
          ctx.logger.error(`Error:`, err)
          return `数据获取失败，请查看后台日志喵~`
        }
        return
      }

      await session.send('获取数据中，请稍后喵~')
      // 使用缓存
      const cacheFile = path.resolve(ctx.baseDir, 'cache/maimai-status/maimai-status.png')
      if (lastScreenshot && lastFetchedAt && Date.now() - lastFetchedAt < ctx.config.cacheTime * 60 * 1000) {
        ctx.logger.info(`在缓存时间内，发送缓存图片`)
        await session.send(h.image(lastScreenshot, 'image/png'))
        return
      }
      const url = "https://status.moriya.blue/status/wahlap"

      let page

      try {
        page = await ctx.puppeteer.page();
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' });
          Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
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

        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 })

        const PAGE_LOAD_TIMEOUT_MS = 30000

        await page.setDefaultNavigationTimeout(PAGE_LOAD_TIMEOUT_MS)
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        })

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
