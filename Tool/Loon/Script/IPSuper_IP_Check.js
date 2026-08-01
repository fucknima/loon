/*
 * IPSuper IP聚合检测 · Loon Generic Script
 * 内部版本：1.0；独立插件，不影响现有IP纯净度检测
 * 数据页面：https://ipsuper.com/
 */

var IPSUPER_URL = 'https://ipsuper.com/';
var IP_ENDPOINTS = [
  'https://api64.ipify.org?format=json',
  'https://api.ipify.org?format=json',
  'https://api-ipv4.ip.sb/ip'
];

var title = 'IPSuper聚合检测';
var content = '正在检测，请稍候…';
var htmlMessage = simpleHtml(content);

(async function () {
  var node = getNodeName();
  var page = '';
  var pageError = '';
  var exitIP = '';
  var ipError = '';

  try {
    page = await requestText({
      url: IPSUPER_URL,
      node: node || undefined,
      timeout: 15000,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
      },
      'auto-redirect': true,
      'auto-cookie': false
    }, 'IPSuper');
  } catch (error) {
    pageError = errorText(error);
  }

  try {
    exitIP = await detectExitIP(node);
  } catch (error) {
    ipError = errorText(error);
  }

  var report = parseIPSuper(page, exitIP);
  if (!report.ip && exitIP) report.ip = exitIP;

  var result = buildResult({
    node: node,
    report: report,
    pageError: pageError,
    ipError: ipError,
    pageAvailable: !!page
  });

  title = result.title;
  content = result.content;
  htmlMessage = result.html;
})()
  .catch(function (error) {
    title = 'IPSuper检测失败';
    content = '错误：' + errorText(error) + '\n节点：' + (getNodeName() || '未知');
    htmlMessage = simpleHtml(content);
  })
  .finally(function () {
    $done({ title: title, content: content, htmlMessage: htmlMessage });
  });

async function detectExitIP(node) {
  var errors = [];
  for (var i = 0; i < IP_ENDPOINTS.length; i++) {
    try {
      var body = await requestText({
        url: IP_ENDPOINTS[i],
        node: node || undefined,
        timeout: 6000,
        headers: { Accept: 'application/json,text/plain', 'User-Agent': 'Loon IPSuper Checker/1.0' }
      }, '出口IP');
      var match = body.match(/(?:^|[^0-9a-fA-F:.])((?:\d{1,3}\.){3}\d{1,3})(?:$|[^0-9])/);
      if (match) return match[1];
      var json;
      try { json = JSON.parse(body); } catch (_) { json = null; }
      if (json && json.ip) return String(json.ip);
      var clean = String(body || '').trim();
      if (isIP(clean)) return clean;
      throw new Error('未返回有效IP');
    } catch (error) {
      errors.push(errorText(error));
    }
  }
  throw new Error(errors.join('；') || '出口IP查询失败');
}

function parseIPSuper(html, fallbackIP) {
  var text = htmlToText(html);
  var report = {
    ip: '',
    score: null,
    level: '',
    threats: null,
    threatTypes: null,
    ipType: '',
    location: '',
    asn: '',
    mode: '',
    parsed: false
  };

  if (!text) return report;

  report.ip = extractIP(text) || fallbackIP || '';
  report.score = extractNumber(text, [
    /综合安全分\s*(?:安全|低风险|中风险|高风险)?\s*(\d{1,3})/i,
    /多源加权得到\s*越大越好\s*(\d{1,3})\s*\/\s*100/i,
    /(?:^|\s)(\d{1,3})\s*\/\s*100\s*(?:安全|低风险|中风险|高风险)/i
  ]);
  report.threats = extractNumber(text, [/威胁(?:数目)?\s*[:：]?\s*(\d+)/i]);
  report.threatTypes = extractNumber(text, [/威胁种类\s*[:：]?\s*(\d+)/i, /种类\s*[:：]?\s*(\d+)/i]);
  report.level = extractFirst(text, [
    /综合安全分\s*(安全|低风险|中风险|高风险|危险)/i,
    /\d{1,3}\s*\/\s*100\s*(安全|低风险|中风险|高风险|危险)/i
  ]);
  report.ipType = extractLabelValue(text, 'IP类型', ['位置', '经纬度', 'ASN', '多源IP类型']);
  report.location = extractLabelValue(text, '位置', ['经纬度', 'ASN', '多源IP类型']);
  report.asn = extractFirst(text, [/(AS\s*\d{1,10}(?:\s+[^\n]{0,80})?)/i]);
  report.mode = /专业检测|专业模式/i.test(text) ? '专业检测' : /简易检测|简易模式/i.test(text) ? '简易检测' : '';
  report.parsed = report.score !== null || report.threats !== null || !!report.ipType || !!report.location || !!report.asn;
  return report;
}

function buildResult(ctx) {
  var r = ctx.report;
  var hasScore = typeof r.score === 'number' && !isNaN(r.score);
  var judgement = judge(r.score, r.level, r.threats);
  var scoreText = hasScore ? String(r.score) : '--';
  var parseStatus = r.parsed ? '页面结果已解析' : ctx.pageAvailable ? '页面需浏览器渲染' : '网站请求失败';
  var openURL = r.ip ? IPSUPER_URL + '?ip=' + encodeURIComponent(r.ip) : IPSUPER_URL;

  var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'SF Pro Text\',sans-serif;font-size:15px;line-height:1.45;padding:2px 4px 4px;word-break:break-word">' +
    '<div style="text-align:center;padding:5px 0 13px">' +
      '<div style="font-size:12px;color:#8E8E93">IPSuper 综合安全分</div>' +
      '<div style="font-size:46px;font-weight:800;line-height:1.05;color:' + judgement.color + '">' + esc(scoreText) + '<span style="font-size:15px;font-weight:600">' + (hasScore ? '/100' : ' 未获取') + '</span></div>' +
      '<div style="font-size:17px;font-weight:700;color:' + judgement.color + ';margin-top:5px">' + esc(judgement.icon + ' ' + judgement.label) + '</div>' +
      '<div style="font-size:11px;color:#8E8E93;margin-top:3px">来源：IPSuper 多源聚合</div>' +
    '</div>' +
    section('检测摘要', parseStatus, r.parsed) +
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:10px">' +
      pairRow(item('威胁数量', numberOrUnknown(r.threats), toneNumber(r.threats)), item('威胁种类', numberOrUnknown(r.threatTypes), toneNumber(r.threatTypes))) +
      pairRow(item('检测模式', r.mode || '未知', 'info'), item('页面解析', r.parsed ? '成功' : '受限', r.parsed ? 'good' : 'warn')) +
    '</table>' +
    section('基础信息', '每行标注来源', true) +
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
      detailRow('出口 IP', r.ip || '未知', '节点实测 / IPSuper', true) +
      detailRow('IP 类型', cleanValue(r.ipType), 'IPSuper', false) +
      detailRow('位置', cleanValue(r.location), 'IPSuper', false) +
      detailRow('ASN', cleanValue(r.asn), 'IPSuper', true) +
      detailRow('当前节点', ctx.node || '未知', 'Loon', false) +
    '</table>' +
    '<div style="font-size:11px;line-height:1.5;text-align:center;color:#8E8E93;margin-top:10px">' +
      esc(r.parsed ? 'IPSuper页面数据已直接解析' : 'IPSuper部分结果依赖浏览器JavaScript，建议点击下方链接查看完整报告') +
      (ctx.pageError ? '<br>网站：' + esc(shortText(ctx.pageError)) : '') +
      (ctx.ipError ? '<br>出口IP：' + esc(shortText(ctx.ipError)) : '') +
      '<br><a href="' + esc(openURL) + '">在 IPSuper 查看完整检测</a>' +
    '</div>' +
  '</div>';

  var text = [
    '【IPSuper综合判断】' + judgement.label,
    '综合安全分：' + (hasScore ? r.score + '/100' : '未获取'),
    '威胁数量：' + numberOrUnknown(r.threats),
    '威胁种类：' + numberOrUnknown(r.threatTypes),
    '检测模式：' + (r.mode || '未知'),
    '',
    '【基础信息】',
    '出口IP：' + (r.ip || '未知'),
    'IP类型：' + cleanValue(r.ipType),
    '位置：' + cleanValue(r.location),
    'ASN：' + cleanValue(r.asn),
    '当前节点：' + (ctx.node || '未知'),
    '',
    '状态：' + parseStatus,
    '完整报告：' + openURL
  ].join('\n');

  return { title: 'IPSuper聚合检测 · ' + (r.ip || '未知'), content: text, html: html };
}

function judge(score, level, threats) {
  var name = String(level || '');
  if (/危险|高风险/.test(name) || (typeof score === 'number' && score < 40)) return { label: '风险较高', icon: '🔴', color: '#FF453A' };
  if (/中风险/.test(name) || (typeof score === 'number' && score < 70)) return { label: '风险一般', icon: '🟠', color: '#FF9F0A' };
  if (/低风险/.test(name) || (typeof score === 'number' && score < 90)) return { label: '较低风险', icon: '🟡', color: '#B89400' };
  if (/安全/.test(name) || (typeof score === 'number' && score >= 90)) return { label: '较为安全', icon: '🟢', color: '#30A84A' };
  if (typeof threats === 'number' && threats === 0) return { label: '未发现明显威胁', icon: '🟢', color: '#30A84A' };
  return { label: '信息不足', icon: '⚪', color: '#8E8E93' };
}

function requestText(options, source) {
  return new Promise(function (resolve, reject) {
    $httpClient.get(options, function (error, response, body) {
      if (error) return reject(new Error(String(error)));
      var status = Number(response && (response.status || response.statusCode) || 0);
      if (status && (status < 200 || status >= 300)) return reject(new Error(source + ' HTTP ' + status));
      var text = String(body || '');
      if (!text.trim()) return reject(new Error(source + ' 返回空内容'));
      resolve(text);
    });
  });
}

function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|section|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function extractIP(text) {
  var marked = text.match(/IP地址\s*((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]{8,})/i);
  if (marked && isIP(marked[1])) return marked[1];
  var all = text.match(/(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-fA-F]{0,4}:){2,}[0-9a-fA-F:]+/g) || [];
  for (var i = 0; i < all.length; i++) if (isIP(all[i])) return all[i];
  return '';
}

function extractNumber(text, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match) {
      var value = Number(match[1]);
      if (!isNaN(value)) return value;
    }
  }
  return null;
}

function extractFirst(text, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match && match[1]) return String(match[1]).trim();
  }
  return '';
}

function extractLabelValue(text, label, stops) {
  var index = text.indexOf(label);
  if (index < 0) return '';
  var value = text.slice(index + label.length, index + label.length + 180).trim();
  var end = value.length;
  for (var i = 0; i < stops.length; i++) {
    var pos = value.indexOf(stops[i]);
    if (pos >= 0 && pos < end) end = pos;
  }
  value = value.slice(0, end).split('\n')[0].trim();
  if (/^(失败|未知|-)?$/.test(value)) return value;
  return value.slice(0, 100);
}

function getNodeName() {
  try {
    return $environment && $environment.params && $environment.params.node ? String($environment.params.node) : '';
  } catch (_) { return ''; }
}

function isIP(value) {
  var text = String(value || '').trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) {
    var parts = text.split('.');
    for (var i = 0; i < parts.length; i++) if (Number(parts[i]) > 255) return false;
    return true;
  }
  return text.indexOf(':') >= 0 && /^[0-9a-fA-F:]+$/.test(text);
}

function section(name, state, ok) {
  return '<table style="width:100%;border-collapse:collapse;margin:0 0 3px"><tr>' +
    '<td style="padding:4px 2px;font-size:14px;font-weight:750">' + esc(name) + '</td>' +
    '<td style="padding:4px 2px;text-align:right;font-size:11px;color:' + (ok ? '#30A84A' : '#FF9F0A') + '">' + esc(state) + '</td>' +
    '</tr></table>';
}

function pairRow(a, b) {
  return '<tr><td style="width:50%;padding:8px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18)">' + a + '</td>' +
    '<td style="width:50%;padding:8px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18)">' + b + '</td></tr>';
}

function item(label, value, tone) {
  var colors = { good: '#30A84A', warn: '#FF9F0A', bad: '#FF453A', info: '#467FCF', neutral: '#8E8E93' };
  var color = colors[tone] || colors.neutral;
  return '<span style="font-size:11px;color:#8E8E93">' + esc(label) + '</span><br>' +
    '<span style="font-size:14px;font-weight:700;color:' + color + '">● ' + esc(value) + '</span>';
}

function detailRow(label, value, source, mono) {
  return '<tr><td style="width:31%;padding:8px 6px 8px 2px;border-bottom:1px solid rgba(128,128,128,.16)">' +
    '<span style="color:#8E8E93">' + esc(label) + '</span><br><span style="font-size:10px;color:#467FCF">来源：' + esc(source) + '</span></td>' +
    '<td style="width:69%;padding:8px 2px 8px 6px;text-align:right;font-weight:600;border-bottom:1px solid rgba(128,128,128,.16);overflow-wrap:anywhere;' +
    (mono ? 'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;' : '') + '">' + esc(value) + '</td></tr>';
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(Number(d)); });
}

function cleanValue(value) {
  var text = String(value || '').trim();
  return text && text !== '-' ? text : '未获取';
}

function numberOrUnknown(value) { return typeof value === 'number' && !isNaN(value) ? String(value) : '未知'; }
function toneNumber(value) { return typeof value !== 'number' ? 'neutral' : value === 0 ? 'good' : value <= 2 ? 'warn' : 'bad'; }
function shortText(value) { var text = String(value || '').replace(/\s+/g, ' '); return text.length > 70 ? text.slice(0, 70) + '…' : text; }
function errorText(error) { return String(error && (error.message || error.error) || error || '未知错误'); }
function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function simpleHtml(text) { return '<div style="font-family:-apple-system;font-size:15px;line-height:1.55">' + esc(text).replace(/\n/g, '<br>') + '</div>'; }
