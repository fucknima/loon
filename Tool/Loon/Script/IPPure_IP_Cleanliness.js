/*
 * IPPure + ipapi.is IP纯净度检测 · Loon Generic Script
 * 内部版本：5.1（固定文件名更新，不使用版本后缀）
 * 更新日期：2026-07-31
 *
 * 布局：精简核心卡片，仅显示风险、IP属性、安全标记、ASN和运营商。
 * 数据源：
 * 1. https://my.ippure.com/v1/info
 * 2. https://api.ipapi.is/
 *
 * ipapi.is 相同出口 IP 缓存 24 小时，减少免费额度消耗。
 */

const NAME = 'ippure-node-check'
const $ = new Env(NAME)

const IPPURE_API = 'https://my.ippure.com/v1/info'
const IPAPI_API = 'https://api.ipapi.is/'
const CACHE_TTL = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'ippure_ipapi_compact_'

let title = 'IP纯净度检测'
let content = '正在查询 IPPure 与 ipapi.is，请稍候…'
let htmlMessage = simpleHtml(content)

!(async () => {
  const nodeName = getNodeName()
  const nodeOpt = getNodeOpt()

  let ippure = null
  let ipapi = null
  let ippureError = ''
  let ipapiError = ''
  let cacheHit = false
  let cacheAge = 0

  try {
    ippure = await requestJson({
      ...nodeOpt,
      url: IPPURE_API,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Loon IP Purity Checker',
      },
      'auto-redirect': true,
      'auto-cookie': false,
    }, 'IPPure')
  } catch (error) {
    ippureError = errorText(error)
    $.logErr(`IPPure: ${ippureError}`)
  }

  const detectedIP = value(ippure, 'ip', '')
  if (detectedIP) {
    const cached = readCache(detectedIP)
    if (cached) {
      ipapi = cached.data
      cacheHit = true
      cacheAge = Date.now() - cached.timestamp
    }
  }

  if (!ipapi) {
    try {
      const query = detectedIP ? `?q=${encodeURIComponent(detectedIP)}` : ''
      ipapi = await requestJson({
        ...nodeOpt,
        url: `${IPAPI_API}${query}`,
        timeout: 12000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Loon IP Purity Checker',
        },
        'auto-redirect': true,
        'auto-cookie': false,
      }, 'ipapi.is')

      const ip = value(ipapi, 'ip', '')
      if (ip) writeCache(ip, ipapi)
    } catch (error) {
      ipapiError = errorText(error)
      $.logErr(`ipapi.is: ${ipapiError}`)
    }
  }

  if (!ippure && !ipapi) {
    throw new Error(`两个接口均失败：IPPure ${ippureError || '未知'}；ipapi.is ${ipapiError || '未知'}`)
  }

  const report = buildReport({
    nodeName,
    ippure: ippure || {},
    ipapi: ipapi || {},
    ippureError,
    ipapiError,
    cacheHit,
    cacheAge,
  })

  title = report.title
  content = report.content
  htmlMessage = report.htmlMessage
})()
  .catch(error => {
    title = 'IP纯净度检测失败'
    content = `错误: ${errorText(error)}\n节点: ${getNodeName() || '未知'}`
    htmlMessage = simpleHtml(content)
  })
  .finally(() => {
    $.done({ title, content, htmlMessage })
  })

function buildReport(ctx) {
  const p = ctx.ippure
  const a = ctx.ipapi
  const ip = value(p, 'ip', value(a, 'ip', '未知'))
  const scoreRaw = Number(value(p, 'fraudScore', NaN))
  const score = Number.isFinite(scoreRaw) ? scoreRaw : null
  const assessment = assess(score, a, p)

  const locationObject = value(a, 'location', {}) || {}
  const country = value(p, 'country', value(locationObject, 'country', ''))
  const region = value(p, 'region', value(locationObject, 'state', ''))
  const city = value(p, 'city', value(locationObject, 'city', ''))
  const countryCode = value(p, 'countryCode', value(locationObject, 'country_code', ''))
  const location = unique([country, region, city]).join(' · ') || '未知'
  const locationText = `${flag(countryCode)} ${location}`.trim()

  const asnObject = value(a, 'asn', {}) || {}
  const companyObject = value(a, 'company', {}) || {}
  const asnNumber = value(asnObject, 'asn', value(p, 'asn', ''))
  const asnType = translateType(value(asnObject, 'type', value(companyObject, 'type', '')))
  const asnText = asnNumber ? `AS${String(asnNumber).replace(/^AS/i, '')}${asnType ? ` · ${asnType}` : ''}` : '未知'
  const organization = value(companyObject, 'name', value(asnObject, 'org', value(p, 'asOrganization', '未知')))

  const residential = value(p, 'isResidential', null)
  const broadcast = value(p, 'isBroadcast', null)
  const datacenter = boolOrUnknown(value(a, 'is_datacenter', null))
  const vpn = boolOrUnknown(value(a, 'is_vpn', null))
  const proxy = boolOrUnknown(value(a, 'is_proxy', null))
  const tor = boolOrUnknown(value(a, 'is_tor', null))
  const abuser = boolOrUnknown(value(a, 'is_abuser', null))

  const networkLabel = residential === true
    ? '住宅 IP'
    : datacenter === true
      ? '机房 IP'
      : residential === false
        ? '非住宅 IP'
        : '未知'

  const nativeLabel = broadcast === true
    ? '广播 / 非原生'
    : broadcast === false
      ? '原生 IP'
      : '未知'

  const badges = [
    badge(networkLabel, networkLabel === '住宅 IP' ? 'good' : networkLabel === '机房 IP' ? 'warn' : 'neutral'),
    badge(nativeLabel, nativeLabel === '原生 IP' ? 'good' : nativeLabel.indexOf('广播') >= 0 ? 'warn' : 'neutral'),
    badge(`VPN ${yesNo(vpn)}`, vpn === true ? 'warn' : vpn === false ? 'good' : 'neutral'),
    badge(`代理 ${yesNo(proxy)}`, proxy === true ? 'warn' : proxy === false ? 'good' : 'neutral'),
    badge(`Tor ${yesNo(tor)}`, tor === true ? 'bad' : tor === false ? 'good' : 'neutral'),
    badge(`滥用 ${yesNo(abuser)}`, abuser === true ? 'bad' : abuser === false ? 'good' : 'neutral'),
  ].join('')

  const sourceLine = sourceStatus(ctx)
  const cacheLine = ctx.cacheHit ? `ipapi.is 缓存 ${duration(ctx.cacheAge)}前` : 'ipapi.is 实时查询'

  const rows = [
    ['出口 IP', ip],
    ['国家地区', locationText],
    ['ASN', asnText],
    ['运营商', organization || '未知'],
    ['当前节点', ctx.nodeName || '未知'],
  ]

  const scoreText = score === null ? '--' : String(score)
  const scoreSuffix = score === null ? '无评分' : '/100'

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;color:inherit;padding:2px 1px 6px;word-break:break-word;">
  <div style="padding:18px 16px 16px;border-radius:18px;background:${assessment.background};text-align:center;margin-bottom:12px;">
    <div style="font-size:13px;opacity:.72;margin-bottom:4px;">IPPure 风险评分</div>
    <div style="font-size:46px;line-height:1;font-weight:800;color:${assessment.color};letter-spacing:-1px;">${escapeHtml(scoreText)}<span style="font-size:15px;font-weight:600;opacity:.72;margin-left:3px;">${escapeHtml(scoreSuffix)}</span></div>
    <div style="font-size:18px;font-weight:750;margin-top:9px;">${escapeHtml(assessment.icon + ' ' + assessment.label)}</div>
    <div style="font-size:13px;opacity:.68;margin-top:5px;">${escapeHtml(ip)}</div>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:7px;margin:0 1px 12px;">${badges}</div>

  <div style="border-radius:16px;background:rgba(127,127,127,.10);padding:3px 14px;">
    ${rows.map(item => row(item[0], item[1])).join('')}
  </div>

  <div style="font-size:11px;line-height:1.5;text-align:center;opacity:.52;margin-top:11px;">
    ${escapeHtml(sourceLine)} · ${escapeHtml(cacheLine)}<br>
    综合结论仅供筛选，最终以目标平台实际风控为准
  </div>
</div>`.trim()

  const text = [
    `风险评分: ${score === null ? '未知' : `${score}/100`}`,
    `综合结论: ${assessment.label}`,
    `出口 IP: ${ip}`,
    `国家地区: ${locationText}`,
    `网络类型: ${networkLabel}`,
    `IP 属性: ${nativeLabel}`,
    `VPN: ${yesNo(vpn)}`,
    `代理: ${yesNo(proxy)}`,
    `Tor: ${yesNo(tor)}`,
    `滥用记录: ${yesNo(abuser)}`,
    `ASN: ${asnText}`,
    `运营商: ${organization || '未知'}`,
    `节点: ${ctx.nodeName || '未知'}`,
    `数据源: ${sourceLine}`,
  ].join('\n')

  return {
    title: `IP纯净度 · ${ip}`,
    content: text,
    htmlMessage: html,
  }
}

function assess(score, ipapi, ippure) {
  const abuser = value(ipapi, 'is_abuser', false) === true
  const tor = value(ipapi, 'is_tor', false) === true
  const bogon = value(ipapi, 'is_bogon', false) === true
  const broadcast = value(ippure, 'isBroadcast', false) === true
  const datacenter = value(ipapi, 'is_datacenter', false) === true

  if (abuser || tor || bogon || (score !== null && score >= 70)) {
    return { label: '风险较高', icon: '🔴', color: '#FF453A', background: 'rgba(255,69,58,.10)' }
  }
  if ((score !== null && score >= 40) || broadcast || datacenter) {
    return { label: '纯净度一般', icon: '🟠', color: '#FF9F0A', background: 'rgba(255,159,10,.11)' }
  }
  if (score !== null && score >= 20) {
    return { label: '较低风险', icon: '🟡', color: '#FFD60A', background: 'rgba(255,214,10,.10)' }
  }
  if (score !== null) {
    return { label: '较为纯净', icon: '🟢', color: '#30D158', background: 'rgba(48,209,88,.10)' }
  }
  return { label: '信息不足', icon: '⚪', color: '#8E8E93', background: 'rgba(142,142,147,.10)' }
}

function badge(text, tone) {
  const styles = {
    good: ['#30D158', 'rgba(48,209,88,.13)'],
    warn: ['#FF9F0A', 'rgba(255,159,10,.14)'],
    bad: ['#FF453A', 'rgba(255,69,58,.14)'],
    neutral: ['#8E8E93', 'rgba(142,142,147,.13)'],
  }
  const style = styles[tone] || styles.neutral
  return `<span style="display:inline-block;padding:6px 9px;border-radius:9px;font-size:12px;font-weight:650;color:${style[0]};background:${style[1]};">${escapeHtml(text)}</span>`
}

function row(label, data) {
  return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid rgba(127,127,127,.16);"><span style="font-size:13px;opacity:.58;white-space:nowrap;">${escapeHtml(label)}</span><span style="font-size:13px;font-weight:650;text-align:right;">${escapeHtml(data)}</span></div>`
}

function sourceStatus(ctx) {
  const p = ctx.ippureError ? 'IPPure失败' : 'IPPure正常'
  const a = ctx.ipapiError ? 'ipapi.is失败' : 'ipapi.is正常'
  return `${p} · ${a}`
}

async function requestJson(options, name) {
  const response = await $.http.get(options)
  const status = Number(response.status || response.statusCode || 0)
  if (status < 200 || status >= 300) throw new Error(`${name} HTTP ${status || '未知'}`)
  const raw = String(response.body || '').trim()
  if (!raw) throw new Error(`${name} 返回空内容`)
  let data
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${name} JSON 解析失败`)
  }
  if (data && (data.error || data.message === 'error')) {
    throw new Error(`${name}：${data.error || data.reason || data.message}`)
  }
  return data
}

function getNodeName() {
  try {
    return $environment && $environment.params ? ($environment.params.node || '') : ''
  } catch (error) {
    return ''
  }
}

function getNodeOpt() {
  const node = getNodeName()
  return node ? { node } : {}
}

function cacheKey(ip) {
  return CACHE_PREFIX + String(ip).replace(/[^0-9a-zA-Z]/g, '_')
}

function readCache(ip) {
  try {
    const raw = $.read(cacheKey(ip))
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (!cached || !cached.timestamp || !cached.data) return null
    if (Date.now() - cached.timestamp >= CACHE_TTL) return null
    return cached
  } catch (error) {
    return null
  }
}

function writeCache(ip, data) {
  try {
    $.write(JSON.stringify({ timestamp: Date.now(), data }), cacheKey(ip))
  } catch (error) {}
}

function value(object, path, fallback) {
  try {
    const keys = String(path).split('.')
    let current = object
    for (const key of keys) {
      if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(Object(current), key)) {
        return fallback
      }
      current = current[key]
    }
    return current === null || current === undefined || current === '' ? fallback : current
  } catch (error) {
    return fallback
  }
}

function unique(items) {
  return items.filter(item => item !== null && item !== undefined && String(item).trim() !== '')
    .filter((item, index, array) => array.indexOf(item) === index)
}

function boolOrUnknown(input) {
  return input === true ? true : input === false ? false : null
}

function yesNo(input) {
  return input === true ? '是' : input === false ? '否' : '未知'
}

function translateType(input) {
  const map = {
    isp: '运营商', business: '企业', hosting: '托管/机房', education: '教育',
    government: '政府', banking: '金融', mobile: '移动网络', content: '内容分发',
  }
  return map[String(input || '').toLowerCase()] || String(input || '')
}

function duration(ms) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '不足1分钟'
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours}小时`
}

function flag(code) {
  const text = String(code || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(text)) return '🌐'
  return String.fromCodePoint(...text.split('').map(char => 127397 + char.charCodeAt(0)))
}

function escapeHtml(input) {
  return String(input === null || input === undefined ? '' : input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function simpleHtml(text) {
  return `<div style="font-family:-apple-system;font-size:15px;line-height:1.65;word-break:break-word;">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`
}

function errorText(error) {
  return String((error && (error.message || error.error)) || error || '未知错误')
}

function Env(name) {
  class Http {
    get(options) {
      return new Promise((resolve, reject) => {
        $httpClient.get(options, (error, response, body) => {
          if (error) return reject(new Error(String(error)))
          const result = response || {}
          result.body = body
          result.statusCode = result.status || result.statusCode
          resolve(result)
        })
      })
    }
  }

  return new (class {
    constructor(scriptName) {
      this.name = scriptName
      this.http = new Http()
      this.startTime = Date.now()
    }

    read(key) {
      try { return $persistentStore.read(key) } catch (error) { return null }
    }

    write(data, key) {
      try { return $persistentStore.write(data, key) } catch (error) { return false }
    }

    log(message) {
      console.log(String(message))
    }

    logErr(message) {
      console.log(`❗️ ${this.name}: ${errorText(message)}`)
    }

    done(result) {
      this.log(`完成，耗时 ${((Date.now() - this.startTime) / 1000).toFixed(2)} 秒`)
      $done(result || {})
    }
  })(name)
}
