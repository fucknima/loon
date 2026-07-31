/*
 * IPPure + ipapi.is IP纯净度检测 · Loon Generic Script
 * 内部版本：5.0（固定文件名更新，不使用版本后缀）
 * 更新日期：2026-07-31
 *
 * 数据源：
 * 1. https://my.ippure.com/v1/info
 * 2. https://api.ipapi.is
 *
 * 说明：ipapi.is 匿名接口每天 1000 次；相同出口 IP 的结果缓存 24 小时。
 */

const NAME = 'ippure-node-check'
const $ = new Env(NAME)

const IPPURE_API = 'https://my.ippure.com/v1/info'
const IPAPI_API = 'https://api.ipapi.is/'
const CACHE_TTL = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'ippure_ipapi_full_v1_'

let title = 'IP纯净度检测'
let content = '正在查询 IPPure 与 ipapi.is，请稍候…'
let htmlMessage = toSimpleHtml(content)

!(async () => {
  const nodeName = getNodeName()
  const nodeInfo = getNodeInfo()
  const nodeOpt = getNodeOpt()

  $.log(`运行环境: ${$.getEnv()}`)
  $.log(`节点交互: ${isInteraction()}`)
  $.log(`节点名称: ${nodeName}`)
  $.log(`节点信息: ${$.toStr(nodeInfo)}`)

  let ippure = null
  let ippureError = ''
  let ipapi = null
  let ipapiError = ''
  let ipapiCache = { hit: false, ageMs: 0 }

  try {
    ippure = await requestJson({
      ...nodeOpt,
      url: IPPURE_API,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Loon IP Purity Checker/5.0',
      },
      'auto-redirect': true,
      'auto-cookie': false,
    }, 'IPPure')
  } catch (error) {
    ippureError = errorMessage(error)
    $.logErr(`IPPure: ${ippureError}`)
  }

  const detectedIP = ippure?.ip || ''

  if (detectedIP) {
    const cached = readIpapiCache(detectedIP)
    if (cached) {
      ipapi = cached.data
      ipapiCache = { hit: true, ageMs: Date.now() - cached.timestamp }
      $.log(`命中 ipapi.is 缓存: ${detectedIP}, age=${ipapiCache.ageMs}ms`)
    }
  }

  if (!ipapi) {
    try {
      const query = detectedIP
        ? `?q=${encodeURIComponent(detectedIP)}&geoloc_meta=1`
        : '?geoloc_meta=1'

      ipapi = await requestJson({
        ...nodeOpt,
        url: `${IPAPI_API}${query}`,
        timeout: 12000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Loon IP Purity Checker/5.0',
        },
        'auto-redirect': true,
        'auto-cookie': false,
      }, 'ipapi.is')

      if (ipapi?.ip) {
        writeIpapiCache(ipapi.ip, ipapi)
      }
    } catch (error) {
      ipapiError = errorMessage(error)
      $.logErr(`ipapi.is: ${ipapiError}`)
    }
  }

  if (!ippure && !ipapi) {
    throw new Error(`两个接口均查询失败；IPPure：${ippureError || '未知'}；ipapi.is：${ipapiError || '未知'}`)
  }

  const report = buildReport({
    nodeName,
    nodeInfo,
    ippure,
    ippureError,
    ipapi,
    ipapiError,
    ipapiCache,
  })

  title = report.title
  content = report.content
  htmlMessage = report.htmlMessage
})()
  .catch(error => {
    $.logErr(error)
    title = 'IP纯净度检测失败'
    content = [
      `错误: ${errorMessage(error)}`,
      `节点: ${getNodeName() || '未获取到节点名称'}`,
      `交互模式: ${isInteraction() ? '是' : '否'}`,
    ].join('\n')
    htmlMessage = toSimpleHtml(content)
  })
  .finally(() => {
    const result = { title, content, htmlMessage }
    $.log(`返回结果长度: content=${content.length}, html=${htmlMessage.length}`)
    $.done(result)
  })

function buildReport(ctx) {
  const sections = []
  const ippure = ctx.ippure || {}
  const ipapi = ctx.ipapi || {}
  const scoreNumber = Number(ippure.fraudScore)
  const score = Number.isFinite(scoreNumber) ? scoreNumber : null
  const summary = combinedAssessment(ippure, ipapi)
  const exitIP = ippure.ip || ipapi.ip || '未知'

  addSection(sections, '综合结论', compactRows([
    ['出口 IP', exitIP],
    ['本地综合判定', summary.label],
    ['判定依据', summary.reasons.join('；') || '未发现明显风险标记'],
    ['IPPure 风险', score === null ? '未知' : `${score}/100 · ${riskLevel(score)}`],
    ['ipapi.is 安全命中', securityFlagsText(ipapi)],
    ['数据源状态', sourceStatus(ctx)],
    ['ipapi.is 缓存', ctx.ipapiCache.hit ? `已命中 · ${formatDuration(ctx.ipapiCache.ageMs)}前` : '未命中，本次实时查询'],
  ]))

  addSection(sections, 'Loon 节点信息', objectRows(ctx.nodeInfo, {
    name: '节点名称',
    address: '服务器地址',
    port: '服务器端口',
    type: '协议类型',
    tls: 'TLS',
  }, ['name', 'address', 'port', 'type', 'tls'], [['当前选择', ctx.nodeName || '未知']]))

  if (ctx.ippure) {
    addSection(sections, 'IPPure · 完整字段', objectRows(ctx.ippure, {
      ip: '出口 IP',
      asn: 'ASN',
      asOrganization: 'AS 组织',
      country: '国家',
      countryCode: '国家代码',
      region: '州/省/地区',
      regionCode: '地区代码',
      city: '城市',
      timezone: '时区',
      longitude: '经度',
      latitude: '纬度',
      postalCode: '邮政编码',
      fraudScore: '风险评分',
      isResidential: '住宅 IP',
      isBroadcast: '广播 IP/非原生',
      userAgent: '请求 User-Agent',
    }, [
      'ip', 'fraudScore', 'isResidential', 'isBroadcast', 'asn', 'asOrganization',
      'country', 'countryCode', 'region', 'regionCode', 'city', 'postalCode',
      'latitude', 'longitude', 'timezone', 'userAgent',
    ], [], {
      fraudScore: value => `${value}/100 · ${riskLevel(Number(value))}`,
      isResidential: value => boolText(value, '是 · 住宅 IP', '否 · 机房/非住宅 IP'),
      isBroadcast: value => boolText(value, '是 · 广播/非原生 IP', '否 · 原生 IP'),
      asn: value => value === null || value === undefined ? '未知' : `AS${value}`,
    }))
  } else {
    addSection(sections, 'IPPure', [['接口状态', `查询失败：${ctx.ippureError || '未知错误'}`]])
  }

  if (ctx.ipapi) {
    addSection(sections, 'ipapi.is · 安全与网络', objectRows(ctx.ipapi, {
      ip: '查询 IP',
      rir: '区域互联网注册机构',
      is_bogon: 'Bogon/不可路由地址',
      is_mobile: '移动网络',
      is_satellite: '卫星网络',
      is_crawler: '爬虫/机器人',
      is_datacenter: '机房/托管商',
      is_tor: 'Tor 出口',
      is_proxy: '代理出口',
      is_vpn: 'VPN 出口',
      is_abuser: '滥用记录',
      elapsed_ms: '接口处理耗时',
    }, [
      'ip', 'rir', 'is_bogon', 'is_mobile', 'is_satellite', 'is_crawler',
      'is_datacenter', 'is_tor', 'is_proxy', 'is_vpn', 'is_abuser', 'elapsed_ms',
    ], [], {
      is_bogon: riskBoolean,
      is_datacenter: riskBoolean,
      is_tor: riskBoolean,
      is_proxy: riskBoolean,
      is_vpn: riskBoolean,
      is_abuser: riskBoolean,
      is_mobile: yesNo,
      is_satellite: yesNo,
      is_crawler: value => value === false ? '否' : formatValue(value),
      elapsed_ms: value => `${value} ms`,
    }, ['vpn', 'datacenter', 'company', 'abuse', 'asn', 'location']))

    addOptionalObjectSection(sections, 'ipapi.is · VPN 详情', ctx.ipapi.vpn, {
      ip: 'IP', service: 'VPN 服务商', url: '服务商网址', type: '节点类型',
      last_seen: '最后发现时间戳', last_seen_str: '最后发现时间',
      exit_node_region: '出口节点地区', region: '地区标识',
      country_code: '国家代码', city_name: '城市', latitude: '纬度', longitude: '经度',
    }, ['ip', 'service', 'url', 'type', 'last_seen_str', 'last_seen', 'exit_node_region', 'region', 'country_code', 'city_name', 'latitude', 'longitude'], {
      last_seen: formatUnixMs,
      type: translateNetworkType,
    })

    addOptionalObjectSection(sections, 'ipapi.is · 机房/云服务商', ctx.ipapi.datacenter, {
      datacenter: '服务商', domain: '服务商域名', network: '网段', region: '云区域',
      service: '云服务', network_border_group: '网络边界组', code: '机房代码',
      name: '机房名称', city: '城市', state: '州/地区', country: '国家',
    }, ['datacenter', 'domain', 'network', 'service', 'region', 'network_border_group', 'code', 'name', 'city', 'state', 'country'])

    addOptionalObjectSection(sections, 'ipapi.is · IP 所属公司', ctx.ipapi.company, {
      name: '公司/组织', abuser_score: '网段滥用比例', domain: '域名', type: '组织类型',
      network: '持有网段', netname: 'NetName',
    }, ['name', 'type', 'abuser_score', 'domain', 'network', 'netname'], {
      type: translateNetworkType,
    })

    addOptionalObjectSection(sections, 'ipapi.is · ASN 详情', ctx.ipapi.asn, {
      asn: 'ASN', abuser_score: 'ASN 滥用比例', route: '路由前缀', descr: '描述',
      country: '注册国家', active: 'ASN 活跃', org: '组织', domain: '域名',
      abuse: '滥用投诉邮箱', type: 'ASN 类型', created: '建立日期',
      updated: '更新日期', rir: '注册机构',
    }, ['asn', 'type', 'abuser_score', 'route', 'descr', 'country', 'active', 'org', 'domain', 'abuse', 'created', 'updated', 'rir'], {
      asn: value => value === null || value === undefined ? '未知' : `AS${value}`,
      active: yesNo,
      type: translateNetworkType,
    })

    addOptionalObjectSection(sections, 'ipapi.is · 地理位置', ctx.ipapi.location, {
      is_eu_member: '欧盟成员国', calling_code: '国际电话区号', currency_code: '货币代码',
      continent: '大洲代码', country: '国家', country_code: '国家代码', state: '州/省/地区',
      city: '城市', latitude: '纬度', longitude: '经度', zip: '邮政编码', timezone: '时区',
      local_time: '当地时间', local_time_unix: '当地时间戳', is_dst: '夏令时',
      utcoffset: 'UTC 偏移', accuracy: '定位精度', geofeed: 'Geofeed 数据源',
      other: '其他可能国家',
    }, ['country', 'country_code', 'state', 'city', 'zip', 'latitude', 'longitude', 'continent', 'timezone', 'utcoffset', 'local_time', 'local_time_unix', 'is_dst', 'accuracy', 'is_eu_member', 'calling_code', 'currency_code', 'geofeed', 'other'], {
      is_eu_member: yesNo,
      is_dst: yesNo,
      local_time_unix: formatUnixSeconds,
    })

    addOptionalObjectSection(sections, 'ipapi.is · 滥用投诉联系人', ctx.ipapi.abuse, {
      name: '联系人/组织', address: '地址', country: '国家', email: '邮箱', phone: '电话',
    }, ['name', 'address', 'country', 'email', 'phone'])
  } else {
    addSection(sections, 'ipapi.is', [['接口状态', `查询失败：${ctx.ipapiError || '未知错误'}`]])
  }

  addSection(sections, '说明', [
    ['综合判定', '由脚本根据两个接口字段本地汇总，不代表目标平台官方风控结果'],
    ['缓存策略', '同一出口 IP 的 ipapi.is 数据缓存 24 小时，节省免费额度'],
    ['数据更新', 'IPPure 当前为测试接口；ipapi.is 字段新增时会自动显示未识别字段'],
  ])

  return {
    title: `IP纯净度 · ${exitIP}`,
    content: sectionsToText(sections),
    htmlMessage: sectionsToHtml(sections, summary),
  }
}

function addSection(sections, title, rows) {
  if (!rows || rows.length === 0) return
  sections.push({ title, rows })
}

function addOptionalObjectSection(sections, title, object, labels, order, formatters = {}) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return
  const rows = objectRows(object, labels, order, [], formatters)
  if (rows.length) addSection(sections, title, rows)
}

function objectRows(object, labels = {}, order = [], leadingRows = [], formatters = {}, excludedKeys = []) {
  const rows = leadingRows.slice()
  if (!object || typeof object !== 'object') return rows

  const used = new Set()
  order.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(object, key)) return
    if (excludedKeys.includes(key)) return
    const value = object[key]
    if (value === undefined) return
    rows.push([labels[key] || key, formatField(key, value, formatters)])
    used.add(key)
  })

  Object.keys(object).sort().forEach(key => {
    if (used.has(key) || excludedKeys.includes(key)) return
    const value = object[key]
    if (value === undefined) return
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push([labels[key] || `其他字段 · ${key}`, JSON.stringify(value)])
    } else {
      rows.push([labels[key] || `其他字段 · ${key}`, formatField(key, value, formatters)])
    }
  })

  return compactRows(rows)
}

function compactRows(rows) {
  return rows.filter(row => row && row.length >= 2 && row[1] !== undefined)
}

function formatField(key, value, formatters) {
  if (formatters && typeof formatters[key] === 'function') {
    try {
      return formatters[key](value)
    } catch (e) {}
  }
  return formatValue(value)
}

function formatValue(value) {
  if (value === null) return '无'
  if (value === undefined) return '未知'
  if (value === true) return '是'
  if (value === false) return '否'
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join('、') : '空数组'
  if (typeof value === 'object') return JSON.stringify(value)
  if (value === '') return '空'
  return String(value)
}

function sourceStatus(ctx) {
  const parts = []
  parts.push(ctx.ippure ? 'IPPure：正常' : `IPPure：失败(${ctx.ippureError || '未知'})`)
  parts.push(ctx.ipapi ? 'ipapi.is：正常' : `ipapi.is：失败(${ctx.ipapiError || '未知'})`)
  return parts.join('；')
}

function securityFlagsText(data) {
  if (!data || typeof data !== 'object') return '无数据'
  return [
    `机房 ${flagShort(data.is_datacenter)}`,
    `VPN ${flagShort(data.is_vpn)}`,
    `代理 ${flagShort(data.is_proxy)}`,
    `Tor ${flagShort(data.is_tor)}`,
    `滥用 ${flagShort(data.is_abuser)}`,
    `Bogon ${flagShort(data.is_bogon)}`,
  ].join(' · ')
}

function combinedAssessment(ippure, ipapi) {
  const reasons = []
  let level = 0
  const scoreNumber = Number(ippure?.fraudScore)
  const score = Number.isFinite(scoreNumber) ? scoreNumber : null

  if (score !== null) {
    if (score >= 71) {
      level = Math.max(level, 3)
      reasons.push(`IPPure 高风险 ${score}/100`)
    } else if (score >= 51) {
      level = Math.max(level, 2)
      reasons.push(`IPPure 较高风险 ${score}/100`)
    } else if (score >= 31) {
      level = Math.max(level, 1)
      reasons.push(`IPPure 中等风险 ${score}/100`)
    }
  }

  const severeFlags = [
    ['is_bogon', 'Bogon/不可路由'],
    ['is_tor', 'Tor 出口'],
    ['is_proxy', '代理出口'],
    ['is_vpn', 'VPN 出口'],
    ['is_abuser', '存在滥用记录'],
  ]
  severeFlags.forEach(([key, label]) => {
    if (ipapi?.[key] === true) {
      level = Math.max(level, 3)
      reasons.push(label)
    }
  })

  if (ipapi?.is_datacenter === true) {
    level = Math.max(level, 2)
    reasons.push('机房/托管商 IP')
  }
  if (ipapi?.is_mobile === true) reasons.push('移动网络 IP')
  if (ipapi?.is_satellite === true) reasons.push('卫星网络 IP')
  if (ipapi?.is_crawler && ipapi.is_crawler !== false) reasons.push(`爬虫标记 ${ipapi.is_crawler}`)
  if (ippure?.isBroadcast === true) {
    level = Math.max(level, 1)
    reasons.push('IPPure 标记为广播/非原生 IP')
  }

  const labels = [
    '🟢 较干净',
    '🟡 需要注意',
    '🟠 风险偏高',
    '🔴 高风险',
  ]
  return { level, label: labels[level], reasons }
}

function riskLevel(score) {
  if (score === null || !Number.isFinite(score)) return '未知'
  if (score <= 10) return '🟢 极低风险'
  if (score <= 30) return '🟢 低风险'
  if (score <= 50) return '🟡 中等风险'
  if (score <= 70) return '🟠 较高风险'
  return '🔴 高风险'
}

function riskBoolean(value) {
  if (value === true) return '⚠️ 是'
  if (value === false) return '✅ 否'
  return formatValue(value)
}

function yesNo(value) {
  return boolText(value, '是', '否')
}

function boolText(value, trueText, falseText) {
  if (value === true) return trueText
  if (value === false) return falseText
  return formatValue(value)
}

function flagShort(value) {
  if (value === true) return '⚠️是'
  if (value === false) return '✅否'
  return '未知'
}

function translateNetworkType(value) {
  const map = {
    hosting: 'hosting · 托管/机房',
    education: 'education · 教育机构',
    government: 'government · 政府机构',
    banking: 'banking · 银行/金融',
    business: 'business · 商业机构',
    isp: 'isp · 互联网运营商',
    exit_node: 'exit_node · VPN 出口节点',
    vpn_server: 'vpn_server · VPN 服务器',
  }
  return map[value] || formatValue(value)
}

function formatUnixMs(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return formatValue(value)
  return `${number} · ${new Date(number).toISOString()}`
}

function formatUnixSeconds(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return formatValue(value)
  return `${number} · ${new Date(number * 1000).toISOString()}`
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时${minutes % 60}分钟`
  return `${Math.floor(hours / 24)}天${hours % 24}小时`
}

function sectionsToText(sections) {
  return sections.map(section => {
    const rows = section.rows.map(([label, value]) => `${label}: ${formatValue(value)}`).join('\n')
    return `【${section.title}】\n${rows}`
  }).join('\n\n')
}

function sectionsToHtml(sections, summary) {
  const accent = ['#34C759', '#FFCC00', '#FF9500', '#FF3B30'][summary.level] || '#8E8E93'
  const body = sections.map(section => {
    const rows = section.rows.map(([label, value]) => htmlRow(label, value)).join('')
    return `<div style="margin:0 0 14px;border-radius:14px;background:rgba(128,128,128,.10);overflow:hidden;">` +
      `<div style="padding:10px 13px;font-weight:800;font-size:16px;background:rgba(128,128,128,.08);">${escapeHtml(section.title)}</div>` +
      `<div style="padding:1px 13px;">${rows}</div>` +
      `</div>`
  }).join('')

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;line-height:1.45;word-break:break-word;padding:4px 1px;color:inherit;">` +
    `<div style="text-align:center;margin:4px 0 16px;">` +
      `<div style="font-size:25px;font-weight:900;color:${accent};">${escapeHtml(summary.label)}</div>` +
      `<div style="font-size:12px;color:#8E8E93;margin-top:4px;">IPPure + ipapi.is 双源检测</div>` +
    `</div>${body}</div>`
}

function htmlRow(label, value) {
  return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(128,128,128,.16);">` +
    `<span style="color:#8E8E93;min-width:34%;max-width:44%;">${escapeHtml(label)}</span>` +
    `<span style="text-align:right;font-weight:600;max-width:66%;white-space:pre-wrap;">${escapeHtml(formatValue(value))}</span>` +
    `</div>`
}

function toSimpleHtml(text) {
  return `<div style="font-family:-apple-system;font-size:16px;line-height:1.65;word-break:break-word">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function requestJson(options, sourceName) {
  const response = await $.http.get(options)
  const status = Number(response?.status || response?.statusCode || 0)
  if (status < 200 || status >= 300) {
    throw new Error(`${sourceName} 返回 HTTP ${status || '未知'}`)
  }

  const rawBody = String(response?.body || '')
  if (!rawBody.trim()) throw new Error(`${sourceName} 返回空内容`)

  try {
    const data = JSON.parse(rawBody)
    if (data?.error) {
      const message = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
      throw new Error(`${sourceName}：${message}`)
    }
    return data
  } catch (error) {
    if (String(error?.message || '').startsWith(`${sourceName}：`)) throw error
    throw new Error(`${sourceName} JSON 解析失败：${rawBody.slice(0, 160)}`)
  }
}

function cacheKey(ip) {
  return `${CACHE_PREFIX}${String(ip).replace(/[^a-zA-Z0-9]/g, '_')}`
}

function readIpapiCache(ip) {
  try {
    const raw = $.getdata(cacheKey(ip))
    if (!raw) return null
    const cache = JSON.parse(raw)
    if (!cache || !cache.timestamp || !cache.data) return null
    if (Date.now() - cache.timestamp > CACHE_TTL) return null
    return cache
  } catch (e) {
    $.logErr(`读取缓存失败: ${e}`)
    return null
  }
}

function writeIpapiCache(ip, data) {
  try {
    $.setdata(JSON.stringify({ timestamp: Date.now(), data }), cacheKey(ip))
  } catch (e) {
    $.logErr(`写入缓存失败: ${e}`)
  }
}

function getNodeName() {
  try {
    return $environment?.params?.node || $environment?.params?.nodeInfo?.name || ''
  } catch (e) {
    return ''
  }
}

function getNodeInfo() {
  try {
    const info = $environment?.params?.nodeInfo
    if (info && typeof info === 'object') return info
    return {}
  } catch (e) {
    return {}
  }
}

function isInteraction() {
  return (
    $.isLoon() &&
    typeof $environment !== 'undefined' &&
    Boolean($environment?.params?.node)
  )
}

function getNodeOpt() {
  if (isInteraction()) return { node: $environment.params.node }
  return {}
}

function errorMessage(error) {
  return String(error?.message || error?.error || error || '未知错误')
}

function Env(name) {
  class Http {
    get(options) {
      return new Promise((resolve, reject) => {
        $httpClient.get(options, (error, response, body) => {
          if (error) {
            reject(new Error(String(error)))
            return
          }
          response = response || {}
          response.body = body
          response.statusCode = response.status || response.statusCode
          resolve(response)
        })
      })
    }
  }

  return new (class {
    constructor(name) {
      this.name = name
      this.http = new Http()
      this.startTime = Date.now()
      this.log(`🔔 ${this.name}, 开始`)
    }

    getEnv() {
      if (typeof $loon !== 'undefined') return 'Loon'
      if (typeof $task !== 'undefined') return 'Quantumult X'
      if (typeof module !== 'undefined' && module.exports) return 'Node.js'
      return 'Unknown'
    }

    isLoon() {
      return this.getEnv() === 'Loon'
    }

    getdata(key) {
      if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key)
      return null
    }

    setdata(value, key) {
      if (typeof $persistentStore !== 'undefined') return $persistentStore.write(value, key)
      return false
    }

    toStr(value) {
      try {
        return JSON.stringify(value)
      } catch (e) {
        return String(value)
      }
    }

    log(...args) {
      console.log(args.join(' '))
    }

    logErr(error) {
      console.log(`❗️ ${this.name}: ${error?.stack || error}`)
    }

    done(result = {}) {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(3)
      this.log(`🔔 ${this.name}, 结束，耗时 ${elapsed}s`)
      $done(result)
    }
  })(name)
}
