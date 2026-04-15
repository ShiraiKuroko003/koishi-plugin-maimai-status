
import { Context, h, Schema } from 'koishi'
import * as path from 'path'
import * as fs from 'fs'

export const name = 'maimai-status'

interface StatusPageMonitor {
  id: number
  name: string
  type: string
}

interface StatusPageGroup {
  id: number
  name: string
  monitorList: StatusPageMonitor[]
}

interface StatusPageIncident {
  id: number
  style: string
  title: string
  content: string
  pin: boolean
  active: boolean
  createdDate: string
}

interface StatusPageMaintenance {
  id: number
  title: string
  active: boolean
  interval: number
}

interface StatusPageResponse {
  publicGroupList?: StatusPageGroup[]
  incidents?: StatusPageIncident[]
  maintenanceList?: StatusPageMaintenance[]
}

interface HeartbeatInfo {
  status: number
  time: string
  msg: string
  ping: number
}

interface HeartbeatResponse {
  heartbeatList?: Record<string, HeartbeatInfo[]>
}

export interface Config {
  timeout: number
}

export const Config: Schema<Config> = Schema.object({
  "timeout": Schema.number().default(5000).description("若频繁出现连接超时报错，请适当提高该值，默认值为5000毫秒"),
})

function getStatusIcon(status?: number) {
  switch (status) {
    case 1:
      return '✅'
    case 0:
      return '❌'
    case 2:
      return '⚠️'
    case 3:
      return '🛠️'
    default:
      return '❔'
  }
}

function getStatusText(status?: number) {
  switch (status) {
    case 1:
      return '正常'
    case 0:
      return '离线'
    case 2:
      return '异常'
    case 3:
      return '维护中'
    default:
      return '未知'
  }
}

function formatDateTime(value: string) {
  const date = new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`)
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

async function fetchStatus(ctx: Context, config: Config) {
  const [page, heartbeat] = await Promise.all([
    ctx.http.get(`https://status.awmc.cc/api/status-page/maimai`, { timeout: config.timeout }) as Promise<StatusPageResponse>,
    ctx.http.get(`https://status.awmc.cc/api/status-page/heartbeat/maimai`, { timeout: config.timeout }) as Promise<HeartbeatResponse>,
  ])

  return { page, heartbeat }
}

function buildStatusText(page: StatusPageResponse, heartbeat: HeartbeatResponse) {
  const groups = page.publicGroupList ?? []
  const incidents = (page.incidents ?? []).filter((incident) => incident.active)
  const maintenanceList = (page.maintenanceList ?? []).filter((maintenance) => maintenance.active)
  const heartbeatList = heartbeat.heartbeatList ?? {}

  const lines: string[] = []

  if (incidents.length > 0) {
    lines.push('公告与故障：')
    for (const incident of incidents) {
      lines.push(`- ${incident.title}`)
    }
    lines.push('')
  }

  if (maintenanceList.length > 0) {
    lines.push('计划维护：')
    for (const maintenance of maintenanceList) {
      lines.push(`- ${maintenance.title}`)
    }
    lines.push('')
  }

  for (const group of groups) {
    lines.push(group.name)
    for (const monitor of group.monitorList) {
      const latestHeartbeat = heartbeatList[String(monitor.id)]?.[0]
      const icon = getStatusIcon(latestHeartbeat?.status)
      const statusText = getStatusText(latestHeartbeat?.status)
      const ping = latestHeartbeat?.ping ?? '未知'
      lines.push(`- ${icon} ${monitor.name}（${statusText}，${ping}ms）`)
    }
    lines.push('')
  }

  const latestTime = Object.values(heartbeatList)
    .flat()
    .map((item) => item.time)
    .filter(Boolean)
    .sort()
    .at(-1)

  lines.push(`更新时间：${latestTime ? formatDateTime(latestTime) : '未知'}`)

  return lines.join('\n').trim()
}

function isHealthy(page: StatusPageResponse, heartbeat: HeartbeatResponse) {
  const groups = page.publicGroupList ?? []
  const incidents = (page.incidents ?? []).filter((incident) => incident.active)
  const maintenanceList = (page.maintenanceList ?? []).filter((maintenance) => maintenance.active)
  const heartbeatList = heartbeat.heartbeatList ?? {}

  const targetGroups = groups.filter((group) =>
    /CMCC|CT|CU/.test(group.name)
  )

  const lineHealthStatuses = targetGroups.map((group) => {
    const statuses = group.monitorList.map(
      (monitor) => heartbeatList[String(monitor.id)]?.[0]?.status
    )

    return statuses.length > 0 && statuses.every((status) => status === 1)
  })
  
  if (lineHealthStatuses.length === 0) return false

  const allLinesDown = lineHealthStatuses.every((healthy) => !healthy)

  return (
    incidents.length === 0 &&
    maintenanceList.length === 0 &&
    !allLinesDown
  )
}

export function apply(ctx: Context, config: Config) {

  ctx.command('有网吗')
    .action(async ({ session }) => {
      try {
        const { page, heartbeat } = await fetchStatus(ctx, config)
        const groups = page.publicGroupList ?? []

        if (groups.length === 0) {
          return '当前没有获取到任何服务器状态数据，请检查状态页配置或网络喵~'
        }

        const sendStatus = buildStatusText(page, heartbeat)
        const img = path.resolve(__dirname, isHealthy(page, heartbeat) ? '../assets/green.png' : '../assets/gray.png')

        if (!session) {
          return sendStatus
        }
          await session.send([
            h.image(fs.readFileSync(img), 'image/png'),
            h.text(sendStatus),
          ])
        }
      catch (err) {
        ctx.logger.error('Error:', err)
        return '数据获取失败，请查看后台日志喵~'
      }
    })
}
