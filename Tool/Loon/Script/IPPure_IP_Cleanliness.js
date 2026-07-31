/*
 * IPPure + ipapi.is IP纯净度检测 · Loon Generic Script
 * 内部版本：5.3（固定文件名更新，不使用版本后缀）
 * 更新日期：2026-07-31
 *
 * 布局：明确区分 IPPure、ipapi.is 与本地综合判断的数据来源。
 * 查询：IPPure 走被检测节点；ipapi.is 使用 DIRECT，并自动切换备用服务器。
 * 缓存：相同出口 IP 的 ipapi.is 成功结果缓存 24 小时。
 */

const NAME = 'ippure-node-check'
const IPPURE_API = 'https://my.ippure.com/v1/info'
const IPAPI_SERVERS = [
  { name: '自动线路', url: 'https://api.ipapi.is/' },
  { name: '新加坡', url: 'https://sg.ipapi.is/' },
  { name: '德国', url: 'https://de.ipapi.is/' },
  { name: '美国', url: 'https://us.ipapi.is/' },
]
const CACHE_TTL = 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'ippure_ipapi_compact_v2_'

let title = 'IP纯净度检测'
let content = '正在检测，请稍候…'
let htmlMessage = simpleHtml(content)

!(async function () {
  const nodeName = getNodeName()
  const nodeOpt = nodeName ? { node: nodeName } : {}

  let ippure = null
  let ippureError = ''
  let ipapi = null
  let ipapiError = ''
  let ipapiServer = ''
  let cacheHit = false
  let cacheAge = 0

  try {
    ippure = await requestJson({
      ...nodeOpt,
      url: IPPURE_API,
      timeout: 8000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Loon IP Purity Checker',
      },
      'auto-redirect': true,
      'auto-cookie': false,
    }, 'IPPure')
  } catch (error) {
    ippureError = errorText(error)
    logError('IPPure', ippureError)
  }

  const detectedIP = get(ippure, 'ip', '')

  if (detectedIP) {
    const cached = readCache(detectedIP)
    if (cached) {
      ipapi = cached.data
      ipapiServer = cached.server || '缓存'
      cacheHit = true
      cacheAge = Date.now() - cached.timestamp
    }
  }

  if (!ipapi) {
    const result = await queryIpapi(detectedIP)
    ipapi = result.data
    ipapiError = result.error
    ipapiServer = result.server

    const resultIP = get(ipapi, 'ip', '')
    if (resultIP) {
      writeCache(resultIP, ipapi, ipapiServer)
    }
  }

  if (!ippure && !ipapi) {
    throw new Error(
      '两个接口均失败；IPPure：' + (ippureError || '未知') +
      '；ipapi.is：' + (ipapiError || '未知')
    )
  }

  const report = buildReport({
    nodeName,
    ippure: ippure || {},
    ippureError,
    ipapi: ipapi || {},
    ipapiError,
    ipapiServer,
    cacheHit,
    cacheAge,
  })

  title = report.title
  content = report.content
  htmlMessage = report.htmlMessage
})()
  .catch(function (error) {
    title = 'IP纯净度检测失败'
    content = '错误：' + errorText(error) + '\n节点：' + (getNodeName() || '未知')
    htmlMessage = simpleHtml(content)
  })
  .finally(function () {
    $done({ title, content, htmlMessage })
  })

async function queryIpapi(ip) {
  const errors = []
  const query = ip ? '?q=' + encodeURIComponent(ip) : ''

  for (let i = 0; i < IPAPI_SERVERS.length; i++) {
    const server = IPAPI_SERVERS[i]

    try {
      const data = await requestJson({
        url: server.url + query,
        node: 'DIRECT',
        timeout: 4500,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Loon IP Purity Checker',
        },
        'auto-redirect': true,
        'auto-cookie': false,
      }, 'ipapi.is ' + server.name)

      if (!get(data, 'ip', '')) {
        throw new Error(get(data, 'message', '接口未返回 IP'))
      }

      return { data, error: '', server: server.name }
    } catch (error) {
      const text = errorText(error)
      errors.push(server.name + '：' + text)
      logError('ipapi.is ' + server.name, text)
    }
  }

  return {
    data: null,
    error: errors.join('；'),
    server: '',
  }
}

function buildReport(ctx) {
  const p = ctx.ippure
  const a = ctx.ipapi
  const hasIppure = Object.keys(p).length > 0
  const hasIpapi = Object.keys(a).length > 0

  const ipInfo = pick([
    { value: get(p, 'ip', ''), source: 'IPPure' },
    { value: get(a, 'ip', ''), source: 'ipapi.is' },
  ], '未知')

  const scoreNumber = Number(get(p, 'fraudScore', NaN))
  const score = Number.isFinite(scoreNumber) ? scoreNumber : null
  const assessment = assess(score, a, p)

  const pLocationParts = unique([
    get(p, 'country', ''),
    get(p, 'region', ''),
    get(p, 'city', ''),
  ])
  const aLocation = get(a, 'location', {}) || {}
  const aLocationParts = unique([
    get(aLocation, 'country', ''),
    get(aLocation, 'state', ''),
    get(aLocation, 'city', ''),
  ])

  const locationInfo = pLocationParts.length
    ? {
        value: (flag(get(p, 'countryCode', '')) + ' ' + pLocationParts.join(' · ')).trim(),
        source: 'IPPure',
      }
    : aLocationParts.length
      ? {
          value: (flag(get(aLocation, 'country_code', '')) + ' ' + aLocationParts.join(' · ')).trim(),
          source: 'ipapi.is',
        }
      : { value: '未知', source: '—' }

  const asnObject = get(a, 'asn', {}) || {}
  const companyObject = get(a, 'company', {}) || {}
  const ipapiAsn = get(asnObject, 'asn', '')
  const ippureAsn = get(p, 'asn', '')
  const asnType = translateType(get(asnObject, 'type', get(companyObject, 'type', '')))

  const asnInfo = ipapiAsn
    ? {
        value: 'AS' + String(ipapiAsn).replace(/^AS/i, '') + (asnType ? ' · ' + asnType : ''),
        source: 'ipapi.is',
      }
    : ippureAsn
      ? {
          value: 'AS' + String(ippureAsn).replace(/^AS/i, ''),
          source: 'IPPure',
        }
      : { value: '未知', source: '—' }

  const ipapiOrg = get(companyObject, 'name', get(asnObject, 'org', ''))
  const ippureOrg = get(p, 'asOrganization', '')
  const organizationInfo = ipapiOrg
    ? { value: ipapiOrg, source: 'ipapi.is' }
    : ippureOrg
      ? { value: ippureOrg, source: 'IPPure' }
      : { value: '未知', source: '—' }

  const residential = normalizeBoolean(get(p, 'isResidential', null))
  const broadcast = normalizeBoolean(get(p, 'isBroadcast', null))
  const datacenter = normalizeBoolean(get(a, 'is_datacenter', null))
  const vpn = normalizeBoolean(get(a, 'is_vpn', null))
  const proxy = normalizeBoolean(get(a, 'is_proxy', null))
  const tor = normalizeBoolean(get(a, 'is_tor', null))
  const abuser = normalizeBoolean(get(a, 'is_abuser', null))

  const residentialText = residential === true
    ? '住宅 IP'
    : residential === false
      ? '非住宅 IP'
      : '未知'

  const nativeText = broadcast === true
    ? '广播 / 非原生'
    : broadcast === false
      ? '原生 IP'
      : '未知'

  const scoreText = score === null ? '--' : String(score)
  const scoreSuffix = score === null ? '无评分' : '/100'

  const cacheText = ctx.cacheHit
    ? '缓存 · ' + duration(ctx.cacheAge) + '前'
    : ctx.ipapiServer
      ? '实时 · ' + ctx.ipapiServer
      : '未获取'

  const ippureStatus = hasIppure
    ? '正常'
    : '失败' + (ctx.ippureError ? ' · ' + shortError(ctx.ippureError) : '')

  const ipapiStatus = hasIpapi
    ? cacheText
    : '失败' + (ctx.ipapiError ? ' · ' + shortError(ctx.ipapiError) : '')

  const ippureRows = [
    [
      statusCell('住宅属性', residentialText, toneForResidential(residential)),
      statusCell('IP 属性', nativeText, toneForNative(nativeText)),
    ],
  ]

  const ipapiRows = [
    [
      statusCell('机房', yesNo(datacenter), toneForRisk(datacenter)),
      statusCell('VPN', yesNo(vpn), toneForRisk(vpn)),
    ],
    [
      statusCell('代理', yesNo(proxy), toneForRisk(proxy)),
      statusCell('Tor', yesNo(tor), toneForRisk(tor)),
    ],
    [
      statusCell('滥用', yesNo(abuser), toneForRisk(abuser)),
      statusCell('接口', hasIpapi ? '正常' : '失败', hasIpapi ? 'good' : 'bad'),
    ],
  ]

  const detailRows = [
    ['出口 IP', ipInfo.value, ipInfo.source],
    ['国家地区', locationInfo.value, locationInfo.source],
    ['ASN', asnInfo.value, asnInfo.source],
    ['运营商', organizationInfo.value, organizationInfo.source],
    ['当前节点', ctx.nodeName || '未知', 'Loon'],
  ]

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;font-size:15px;line-height:1.45;color:inherit;padding:2px 4px 4px;word-break:break-word;">
  <div style="text-align:center;padding:5px 0 12px;">
    <div style="font-size:12px;color:#8E8E93;">IPPure 风险评分</div>
    <div style="font-size:46px;line-height:1.08;font-weight:800;color:${assessment.color};">${escapeHtml(scoreText)}<span style="font-size:15px;font-weight:600;">${escapeHtml(scoreSuffix)}</span></div>
    <div style="font-size:17px;font-weight:700;color:${assessment.color};margin-top:3px;">${escapeHtml(assessment.icon + ' ' + assessment.label)}</div>
    <div style="font-size:11px;color:#8E8E93;margin-top:3px;">本地综合判断 · IPPure + ipapi.is</div>
  </div>

  ${sectionHeader('IPPure 检测', ippureStatus, hasIppure)}
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 11px;" cellpadding="0" cellspacing="0">
    ${ippureRows.map(statusTableRow).join('')}
  </table>

  ${sectionHeader('ipapi.is 检测', ipapiStatus, hasIpapi)}
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 11px;" cellpadding="0" cellspacing="0">
    ${ipapiRows.map(statusTableRow).join('')}
  </table>

  ${sectionHeader('基础信息', '每行已标注来源', true)}
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;" cellpadding="0" cellspacing="0">
    ${detailRows.map(detailTableRow).join('')}
  </table>

  <div style="font-size:11px;line-height:1.45;text-align:center;color:#8E8E93;margin-top:10px;">
    综合判断由脚本本地汇总，仅供筛选
  </div>
</div>`.trim()

  const text = [
    '【本地综合判断】' + assessment.label,
    '',
    '【IPPure】',
    '风险评分：' + (score === null ? '未知' : score + '/100'),
    '住宅属性：' + residentialText,
    'IP 属性：' + nativeText,
    '接口状态：' + ippureStatus,
    '',
    '【ipapi.is】',
    '机房：' + yesNo(datacenter),
    'VPN：' + yesNo(vpn),
    '代理：' + yesNo(proxy),
    'Tor：' + yesNo(tor),
    '滥用：' + yesNo(abuser),
    '接口状态：' + ipapiStatus,
    '',
    '【基础信息】',
    '出口 IP：' + ipInfo.value + '（' + ipInfo.source + '）',
    '国家地区：' + locationInfo.value + '（' + locationInfo.source + '）',
    'ASN：' + asnInfo.value + '（' + asnInfo.source + '）',
    '运营商：' + organizationInfo.value + '（' + organizationInfo.source + '）',
    '节点：' + (ctx.nodeName || '未知') + '（Loon）',
  ].join('\n')

  return {
    title: 'IP纯净度 · ' + ipInfo.value,
    content: text,
    htmlMessage: html,
  }
}

function sectionHeader(name, status, ok) {
  const color = ok ? '#30A84A' : '#FF453A'
  return '<table style="width:100%;border-collapse:collapse;margin:0 0 3px;" cellpadding="0" cellspacing="0">' +
    '<tr>' +
      '<td style="padding:4px 2px;font-size:14px;font-weight:750;">' + escapeHtml(name) + '</td>' +
      '<td style="padding:4px 2px;text-align:right;font-size:11px;color:' + color + ';">' + escapeHtml(status) + '</td>' +
    '</tr>' +
  '</table>'
}

function statusTableRow(cells) {
  return '<tr>' +
    '<td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18);">' + cells[0] + '</td>' +
    '<td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18);">' + cells[1] + '</td>' +
    '</tr>'
}

function statusCell(label, valueText, tone) {
  const color = tone === 'good'
    ? '#30A84A'
    : tone === 'warn'
      ? '#FF9F0A'
      : tone === 'bad'
        ? '#FF453A'
        : '#8E8E93'

  const dot = tone === 'neutral' ? '○' : '●'

  return '<span style="font-size:11px;color:#8E8E93;">' + escapeHtml(label) + '</span><br>' +
    '<span style="font-size:14px;font-weight:700;color:' + color + ';">' +
      dot + ' ' + escapeHtml(valueText) +
    '</span>'
}

function detailTableRow(item) {
  return '<tr>' +
    '<td style="width:31%;padding:8px 6px 8px 2px;border-bottom:1px solid rgba(128,128,128,.16);">' +
      '<span style="color:#8E8E93;">' + escapeHtml(item[0]) + '</span><br>' +
      '<span style="font-size:10px;color:#467FCF;">来源：' + escapeHtml(item[2]) + '</span>' +
    '</td>' +
    '<td style="width:69%;padding:8px 2px 8px 6px;text-align:right;font-weight:600;border-bottom:1px solid rgba(128,128,128,.16);">' +
      escapeHtml(item[1]) +
    '</td>' +
    '</tr>'
}

function pick(items, fallback) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item && item.value !== null && typeof item.value !== 'undefined' && String(item.value) !== '') {
      return item
    }
  }
  return { value: fallback, source: '—' }
}

function assess(score, ipapi, ippure) {
  const abuser = normalizeBoolean(get(ipapi, 'is_abuser', null)) === true
  const tor = normalizeBoolean(get(ipapi, 'is_tor', null)) === true
  const bogon = normalizeBoolean(get(ipapi, 'is_bogon', null)) === true
  const broadcast = normalizeBoolean(get(ippure, 'isBroadcast', null)) === true
  const datacenter = normalizeBoolean(get(ipapi, 'is_datacenter', null)) === true

  if (abuser || tor || bogon || (score !== null && score >= 70)) {
    return { label: '风险较高', icon: '🔴', color: '#FF453A' }
  }
  if ((score !== null && score >= 40) || broadcast || datacenter) {
    return { label: '纯净度一般', icon: '🟠', color: '#FF9F0A' }
  }
  if (score !== null && score >= 20) {
    return { label: '较低风险', icon: '🟡', color: '#B89400' }
  }
  if (score !== null) {
    return { label: '较为纯净', icon: '🟢', color: '#30A84A' }
  }
  return { label: '信息不足', icon: '⚪', color: '#8E8E93' }
}

function toneForResidential(value) {
  if (value === true) return 'good'
  if (value === false) return 'warn'
  return 'neutral'
}

function toneForNative(text) {
  if (text === '原生 IP') return 'good'
  if (text.indexOf('广播') >= 0) return 'warn'
  return 'neutral'
}

function toneForRisk(value) {
  if (value === true) return 'bad'
  if (value === false) return 'good'
  return 'neutral'
}

function requestJson(options, source) {
  return new Promise(function (resolve, reject) {
    $httpClient.get(options, function (error, response, body) {
      if (error) {
        reject(new Error(String(error)))
        return
      }

      const status = Number(response && (response.status || response.statusCode) || 0)
      if (status && (status < 200 || status >= 300)) {
        reject(new Error('HTTP ' + status + (body ? ' · ' + String(body).slice(0, 100) : '')))
        return
      }

      const raw = String(body || '').trim()
      if (!raw) {
        reject(new Error(source + ' 返回空内容'))
        return
      }

      try {
        const data = JSON.parse(raw)
        if (data && data.error) {
          reject(new Error(String(data.error)))
          return
        }
        if (data && data.message && !data.ip) {
          reject(new Error(String(data.message)))
          return
        }
        resolve(data)
      } catch (e) {
        reject(new Error(source + ' JSON解析失败 · ' + raw.slice(0, 100)))
      }
    })
  })
}

function getNodeName() {
  try {
    return $environment && $environment.params && $environment.params.node
      ? String($environment.params.node)
      : ''
  } catch (e) {
    return ''
  }
}

function readCache(ip) {
  try {
    const raw = $persistentStore.read(CACHE_PREFIX + sanitizeKey(ip))
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.timestamp || !parsed.data) return null
    if (Date.now() - Number(parsed.timestamp) > CACHE_TTL) return null

    return parsed
  } catch (e) {
    return null
  }
}

function writeCache(ip, data, server) {
  try {
    $persistentStore.write(
      JSON.stringify({ timestamp: Date.now(), data, server }),
      CACHE_PREFIX + sanitizeKey(ip)
    )
  } catch (e) {}
}

function sanitizeKey(text) {
  return String(text || '').replace(/[^0-9a-zA-Z]/g, '_')
}

function get(object, path, fallback) {
  try {
    const parts = String(path).split('.')
    let current = object

    for (let i = 0; i < parts.length; i++) {
      if (current === null || typeof current === 'undefined') return fallback
      current = current[parts[i]]
    }

    return current === null || typeof current === 'undefined' ? fallback : current
  } catch (e) {
    return fallback
  }
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

function yesNo(value) {
  if (value === true) return '是'
  if (value === false) return '否'
  return '未知'
}

function translateType(type) {
  const map = {
    isp: 'ISP',
    hosting: '托管/机房',
    business: '商业网络',
    education: '教育网络',
    government: '政府网络',
    banking: '金融网络',
  }
  return map[String(type || '').toLowerCase()] || String(type || '')
}

function unique(items) {
  return items.filter(function (item, index, array) {
    return item && array.indexOf(item) === index
  })
}

function flag(code) {
  const text = String(code || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(text)) return '🌐'
  return String.fromCodePoint(127397 + text.charCodeAt(0), 127397 + text.charCodeAt(1))
}

function duration(ms) {
  const minutes = Math.floor(Number(ms || 0) / 60000)
  if (minutes < 1) return '不足1分钟'
  if (minutes < 60) return minutes + '分钟'
  return Math.floor(minutes / 60) + '小时'
}

function shortError(text) {
  const valueText = String(text || '').replace(/\s+/g, ' ')
  return valueText.length > 70 ? valueText.slice(0, 70) + '…' : valueText
}

function errorText(error) {
  if (!error) return '未知错误'
  return String(error.message || error.error || error)
}

function logError(source, text) {
  try {
    console.log('❗️ ' + source + '：' + text)
  } catch (e) {}
}

function escapeHtml(value) {
  return String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function simpleHtml(text) {
  return '<div style="font-family:-apple-system;font-size:15px;line-height:1.55;">' +
    escapeHtml(text).replace(/\n/g, '<br>') +
    '</div>'
}
