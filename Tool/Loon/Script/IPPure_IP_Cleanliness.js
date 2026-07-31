/*
 * IPPure + ipapi.is IP纯净度检测 · Loon Generic Script
 * 内部版本：5.4（固定文件名更新，不使用版本后缀）
 * IPv4：IPPure评分 + ipapi.is安全标签；IPv6：IPPure官方不评分，主要依据ipapi.is。
 */

const IPPURE = 'https://my.ippure.com/v1/info'
const IPAPI = [
  ['自动线路', 'https://api.ipapi.is/'],
  ['新加坡', 'https://sg.ipapi.is/'],
  ['德国', 'https://de.ipapi.is/'],
  ['美国', 'https://us.ipapi.is/'],
]
const CACHE_TTL = 86400000
const CACHE_PREFIX = 'ippure_ipapi_v54_'

let title = 'IP纯净度检测'
let content = '正在检测，请稍候…'
let htmlMessage = simpleHtml(content)

!(async function () {
  const node = getNode()
  let p = null, a = null, pErr = '', aErr = '', server = '', cacheAge = -1

  try {
    p = await getJson({
      url: IPPURE,
      node: node || undefined,
      timeout: 8000,
      headers: { Accept: 'application/json', 'User-Agent': 'Loon IP Checker' },
    }, 'IPPure')
  } catch (e) {
    pErr = err(e)
  }

  const detectedIP = val(p, 'ip', '')
  const cached = detectedIP ? readCache(detectedIP) : null
  if (cached) {
    a = cached.data
    server = cached.server || '缓存'
    cacheAge = Date.now() - cached.time
  } else {
    const result = await queryIpapi(detectedIP)
    a = result.data
    aErr = result.error
    server = result.server
    if (a && val(a, 'ip', '')) writeCache(val(a, 'ip', ''), a, server)
  }

  if (!p && !a) throw new Error('IPPure：' + (pErr || '失败') + '；ipapi.is：' + (aErr || '失败'))

  const report = render({ node, p: p || {}, a: a || {}, pErr, aErr, server, cacheAge })
  title = report.title
  content = report.content
  htmlMessage = report.html
})()
  .catch(function (e) {
    title = 'IP纯净度检测失败'
    content = '错误：' + err(e) + '\n节点：' + (getNode() || '未知')
    htmlMessage = simpleHtml(content)
  })
  .finally(function () {
    $done({ title, content, htmlMessage })
  })

async function queryIpapi(ip) {
  const errors = []
  const q = ip ? '?q=' + encodeURIComponent(ip) : ''
  for (let i = 0; i < IPAPI.length; i++) {
    try {
      const data = await getJson({
        url: IPAPI[i][1] + q,
        node: 'DIRECT',
        timeout: 4500,
        headers: { Accept: 'application/json', 'User-Agent': 'Loon IP Checker' },
      }, 'ipapi.is')
      if (!val(data, 'ip', '')) throw new Error(val(data, 'message', '未返回IP'))
      return { data, error: '', server: IPAPI[i][0] }
    } catch (e) {
      errors.push(IPAPI[i][0] + '：' + err(e))
    }
  }
  return { data: null, error: errors.join('；'), server: '' }
}

function render(ctx) {
  const p = ctx.p, a = ctx.a
  const hasP = Object.keys(p).length > 0
  const hasA = Object.keys(a).length > 0
  const ip = val(p, 'ip', val(a, 'ip', '未知'))
  const ipv6 = isIPv6(ip)

  const rawScore = Number(val(p, 'fraudScore', NaN))
  const score = !ipv6 && Number.isFinite(rawScore) ? rawScore : null

  const residential = bool(val(p, 'isResidential', null))
  const broadcast = bool(val(p, 'isBroadcast', null))
  const datacenter = bool(val(a, 'is_datacenter', null))
  const vpn = bool(val(a, 'is_vpn', null))
  const proxy = bool(val(a, 'is_proxy', null))
  const tor = bool(val(a, 'is_tor', null))
  const abuser = bool(val(a, 'is_abuser', null))
  const bogon = bool(val(a, 'is_bogon', null))

  const judge = assessment({ score, ipv6, hasA, datacenter, vpn, proxy, tor, abuser, bogon, broadcast })
  const pStatus = hasP
    ? (ipv6 ? '基础信息正常 · IPv6不评分' : '正常')
    : '失败' + (ctx.pErr ? ' · ' + short(ctx.pErr) : '')
  const aStatus = hasA
    ? (ctx.cacheAge >= 0 ? '缓存 · ' + age(ctx.cacheAge) + '前' : '实时 · ' + (ctx.server || '可用线路'))
    : '失败' + (ctx.aErr ? ' · ' + short(ctx.aErr) : '')

  const residentialText = residential === true ? '住宅 IP' : residential === false ? '非住宅 IP' : ipv6 ? '接口未返回' : '未知'
  const nativeText = broadcast === true ? '广播 / 非原生' : broadcast === false ? '原生 IP' : ipv6 ? '接口未返回' : '未知'

  const locationP = uniq([val(p, 'country', ''), val(p, 'region', ''), val(p, 'city', '')])
  const locA = val(a, 'location', {}) || {}
  const locationA = uniq([val(locA, 'country', ''), val(locA, 'state', ''), val(locA, 'city', '')])
  const location = locationP.length
    ? [flag(val(p, 'countryCode', '')) + ' ' + locationP.join(' · '), 'IPPure']
    : locationA.length
      ? [flag(val(locA, 'country_code', '')) + ' ' + locationA.join(' · '), 'ipapi.is']
      : ['未知', '—']

  const asnObj = val(a, 'asn', {}) || {}
  const company = val(a, 'company', {}) || {}
  const asnA = val(asnObj, 'asn', '')
  const asnP = val(p, 'asn', '')
  const asnType = typeName(val(asnObj, 'type', val(company, 'type', '')))
  const asn = asnA
    ? ['AS' + String(asnA).replace(/^AS/i, '') + (asnType ? ' · ' + asnType : ''), 'ipapi.is']
    : asnP ? ['AS' + String(asnP).replace(/^AS/i, ''), 'IPPure'] : ['未知', '—']

  const orgA = val(company, 'name', val(asnObj, 'org', ''))
  const orgP = val(p, 'asOrganization', '')
  const org = orgA ? [orgA, 'ipapi.is'] : orgP ? [orgP, 'IPPure'] : ['未知', '—']

  const scoreTitle = ipv6 ? 'IPPure IPv6 风险评分' : 'IPPure 风险评分'
  const scoreMain = ipv6 ? 'IPv6' : score === null ? '--' : String(score)
  const scoreSub = ipv6 ? '官方暂不评分' : score === null ? '无评分' : '/100'
  const basis = ipv6 ? '主要依据 ipapi.is' : 'IPPure + ipapi.is'

  const pRows = [[
    status('住宅属性', residentialText, residential === true ? 'good' : residential === false ? 'warn' : 'neutral'),
    status('IP 属性', nativeText, nativeText === '原生 IP' ? 'good' : nativeText.indexOf('广播') >= 0 ? 'warn' : 'neutral'),
  ]]
  const aRows = [
    [status('机房', yesNo(datacenter), riskTone(datacenter)), status('VPN', yesNo(vpn), riskTone(vpn))],
    [status('代理', yesNo(proxy), riskTone(proxy)), status('Tor', yesNo(tor), riskTone(tor))],
    [status('滥用', yesNo(abuser), riskTone(abuser)), status('接口', hasA ? '正常' : '失败', hasA ? 'good' : 'bad')],
  ]
  const details = [
    ['出口 IP', ip, hasP ? 'IPPure' : 'ipapi.is'],
    ['IP 协议', ipv6 ? 'IPv6' : 'IPv4', '本地识别'],
    ['国家地区', location[0], location[1]],
    ['ASN', asn[0], asn[1]],
    ['运营商', org[0], org[1]],
    ['当前节点', ctx.node || '未知', 'Loon'],
  ]

  const ipv6Note = ipv6
    ? '<div style="font-size:11px;color:#8E8E93;line-height:1.45;padding:0 2px 8px;">IPPure官方不对IPv6计算风险分；其他字段以接口实际返回为准。</div>'
    : ''

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;font-size:15px;line-height:1.45;color:inherit;padding:2px 4px 4px;word-break:break-word;">
  <div style="text-align:center;padding:5px 0 12px;">
    <div style="font-size:12px;color:#8E8E93;">${esc(scoreTitle)}</div>
    <div style="font-size:${ipv6 ? '32px' : '46px'};line-height:1.08;font-weight:800;color:${judge.color};">${esc(scoreMain)}</div>
    <div style="font-size:12px;color:#8E8E93;margin-top:2px;">${esc(scoreSub)}</div>
    <div style="font-size:17px;font-weight:700;color:${judge.color};margin-top:5px;">${esc(judge.icon + ' ' + judge.label)}</div>
    <div style="font-size:11px;color:#8E8E93;margin-top:3px;">本地综合判断 · ${esc(basis)}</div>
  </div>
  ${header('IPPure 检测', pStatus, hasP)}
  ${ipv6Note}
  ${table(pRows)}
  ${header('ipapi.is 检测', aStatus, hasA)}
  ${table(aRows)}
  ${header('基础信息', '每行已标注来源', true)}
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">${details.map(detailRow).join('')}</table>
  <div style="font-size:11px;text-align:center;color:#8E8E93;margin-top:10px;">综合判断由脚本本地汇总，仅供筛选</div>
</div>`.trim()

  const text = [
    '【本地综合判断】' + judge.label + '（' + basis + '）',
    '',
    '【IPPure】',
    '风险评分：' + (ipv6 ? 'IPv6 官方暂不评分' : score === null ? '未知' : score + '/100'),
    '住宅属性：' + residentialText,
    'IP 属性：' + nativeText,
    '接口状态：' + pStatus,
    '',
    '【ipapi.is】',
    '机房：' + yesNo(datacenter),
    'VPN：' + yesNo(vpn),
    '代理：' + yesNo(proxy),
    'Tor：' + yesNo(tor),
    '滥用：' + yesNo(abuser),
    '接口状态：' + aStatus,
    '',
    '【基础信息】',
    details.map(function (x) { return x[0] + '：' + x[1] + '（' + x[2] + '）' }).join('\n'),
  ].join('\n')

  return { title: 'IP纯净度 · ' + ip, content: text, html }
}

function assessment(x) {
  if (x.abuser === true || x.tor === true || x.bogon === true || (!x.ipv6 && x.score !== null && x.score >= 70))
    return { label: '风险较高', icon: '🔴', color: '#FF453A' }
  if (x.vpn === true || x.proxy === true || x.datacenter === true || x.broadcast === true || (!x.ipv6 && x.score !== null && x.score >= 40))
    return { label: '存在风险标记', icon: '🟠', color: '#FF9F0A' }
  if (!x.ipv6 && x.score !== null && x.score >= 20)
    return { label: '较低风险', icon: '🟡', color: '#B89400' }
  if (!x.ipv6 && x.score !== null)
    return { label: '较为纯净', icon: '🟢', color: '#30A84A' }
  if (x.ipv6 && x.hasA && [x.abuser, x.tor, x.bogon, x.vpn, x.proxy, x.datacenter].some(function (v) { return v === false }))
    return { label: '未发现明显风险', icon: '🟢', color: '#30A84A' }
  return { label: '信息不足', icon: '⚪', color: '#8E8E93' }
}

function header(name, state, ok) {
  return '<table style="width:100%;border-collapse:collapse;margin:0 0 3px;"><tr>' +
    '<td style="padding:4px 2px;font-size:14px;font-weight:750;">' + esc(name) + '</td>' +
    '<td style="padding:4px 2px;text-align:right;font-size:11px;color:' + (ok ? '#30A84A' : '#FF453A') + ';">' + esc(state) + '</td>' +
    '</tr></table>'
}
function table(rows) {
  return '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 11px;">' + rows.map(function (r) {
    return '<tr><td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18);">' + r[0] + '</td>' +
      '<td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18);">' + r[1] + '</td></tr>'
  }).join('') + '</table>'
}
function status(label, text, tone) {
  const color = tone === 'good' ? '#30A84A' : tone === 'warn' ? '#FF9F0A' : tone === 'bad' ? '#FF453A' : '#8E8E93'
  return '<span style="font-size:11px;color:#8E8E93;">' + esc(label) + '</span><br>' +
    '<span style="font-size:14px;font-weight:700;color:' + color + ';">' + (tone === 'neutral' ? '○' : '●') + ' ' + esc(text) + '</span>'
}
function detailRow(x) {
  return '<tr><td style="width:31%;padding:8px 6px 8px 2px;border-bottom:1px solid rgba(128,128,128,.16);">' +
    '<span style="color:#8E8E93;">' + esc(x[0]) + '</span><br><span style="font-size:10px;color:#467FCF;">来源：' + esc(x[2]) + '</span></td>' +
    '<td style="width:69%;padding:8px 2px 8px 6px;text-align:right;font-weight:600;border-bottom:1px solid rgba(128,128,128,.16);">' + esc(x[1]) + '</td></tr>'
}

function getJson(opt, source) {
  return new Promise(function (resolve, reject) {
    $httpClient.get(opt, function (error, response, body) {
      if (error) return reject(new Error(String(error)))
      const status = Number(response && (response.status || response.statusCode) || 0)
      if (status && (status < 200 || status >= 300)) return reject(new Error('HTTP ' + status))
      const raw = String(body || '').trim()
      if (!raw) return reject(new Error(source + ' 返回空内容'))
      try {
        const data = JSON.parse(raw)
        if (data && data.error) return reject(new Error(String(data.error)))
        resolve(data)
      } catch (e) { reject(new Error(source + ' JSON解析失败')) }
    })
  })
}
function getNode() {
  try { return $environment && $environment.params && $environment.params.node ? String($environment.params.node) : '' }
  catch (e) { return '' }
}
function readCache(ip) {
  try {
    const raw = $persistentStore.read(CACHE_PREFIX + key(ip))
    if (!raw) return null
    const x = JSON.parse(raw)
    if (!x || !x.time || !x.data || Date.now() - Number(x.time) > CACHE_TTL) return null
    return x
  } catch (e) { return null }
}
function writeCache(ip, data, server) {
  try { $persistentStore.write(JSON.stringify({ time: Date.now(), data, server }), CACHE_PREFIX + key(ip)) } catch (e) {}
}
function val(obj, path, fallback) {
  try {
    const parts = String(path).split('.')
    let x = obj
    for (let i = 0; i < parts.length; i++) { if (x == null) return fallback; x = x[parts[i]] }
    return x == null ? fallback : x
  } catch (e) { return fallback }
}
function bool(x) {
  if (x === true || x === false) return x
  if (x === 1 || x === '1' || x === 'true') return true
  if (x === 0 || x === '0' || x === 'false') return false
  return null
}
function yesNo(x) { return x === true ? '是' : x === false ? '否' : '未知' }
function riskTone(x) { return x === true ? 'bad' : x === false ? 'good' : 'neutral' }
function isIPv6(ip) { return typeof ip === 'string' && ip.indexOf(':') >= 0 }
function uniq(a) { return a.filter(function (x, i, arr) { return x && arr.indexOf(x) === i }) }
function typeName(x) {
  const m = { isp: 'ISP', hosting: '托管/机房', business: '商业网络', education: '教育网络', government: '政府网络', banking: '金融网络' }
  return m[String(x || '').toLowerCase()] || String(x || '')
}
function flag(code) {
  const x = String(code || '').toUpperCase()
  return /^[A-Z]{2}$/.test(x) ? String.fromCodePoint(127397 + x.charCodeAt(0), 127397 + x.charCodeAt(1)) : '🌐'
}
function age(ms) { const m = Math.floor(Number(ms || 0) / 60000); return m < 1 ? '不足1分钟' : m < 60 ? m + '分钟' : Math.floor(m / 60) + '小时' }
function key(x) { return String(x || '').replace(/[^0-9a-zA-Z]/g, '_') }
function short(x) { x = String(x || '').replace(/\s+/g, ' '); return x.length > 55 ? x.slice(0, 55) + '…' : x }
function err(e) { return String(e && (e.message || e.error) || e || '未知错误') }
function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
function simpleHtml(x) { return '<div style="font-family:-apple-system;font-size:15px;line-height:1.55;">' + esc(x).replace(/\n/g, '<br>') + '</div>' }
