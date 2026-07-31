/* IPPure + ipapi.is IP纯净度检测
 * 内部版本：5.6；固定文件名
 * 优化：分级判断、动态缓存、失败冷却、双源IP一致性校验、旧版Loon兼容
 */

var IPPURE_API = 'https://my.ippure.com/v1/info';
var IPAPI_SERVERS = [
  ['自动', 'https://api.ipapi.is/'],
  ['新加坡', 'https://sg.ipapi.is/'],
  ['德国', 'https://de.ipapi.is/'],
  ['美国', 'https://us.ipapi.is/']
];
var CACHE_PREFIX = 'ippure_ipapi_v56_';
var TTL_NORMAL = 6 * 60 * 60 * 1000;
var TTL_RISK = 30 * 60 * 1000;
var TTL_FAILURE = 5 * 60 * 1000;

var title = 'IP纯净度检测';
var content = '正在检测，请稍候…';
var htmlMessage = plainHtml(content);

(async function () {
  var node = getNodeName();
  var ippure = null;
  var ippureError = '';
  var ipapi = null;
  var ipapiError = '';
  var ipapiServer = '';
  var cacheState = '';
  var cacheAge = -1;
  var mismatch = null;

  try {
    ippure = await requestJson({
      url: IPPURE_API,
      node: node || undefined,
      timeout: 8000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Loon IP Checker/5.6'
      }
    }, 'IPPure');
  } catch (error) {
    ippureError = errorText(error);
  }

  var ippureIP = valueAt(ippure, 'ip', '');
  var cached = ippureIP ? readCache(ippureIP) : null;

  if (cached) {
    cacheAge = Date.now() - Number(cached.time || 0);
    cacheState = cached.kind || 'success';
    if (cached.kind === 'failure') {
      ipapiError = cached.error || '近期查询失败，暂缓重试';
      ipapiServer = cached.server || '';
    } else {
      ipapi = cached.data || null;
      ipapiServer = cached.server || '缓存';
    }
  } else {
    var result = await queryIpapi(ippureIP, node);
    ipapi = result.data;
    ipapiError = result.error;
    ipapiServer = result.server;
    mismatch = result.mismatch;

    if (ipapi && valueAt(ipapi, 'ip', '')) {
      writeSuccessCache(valueAt(ipapi, 'ip', ''), ipapi, ipapiServer);
    } else if (ippureIP && ipapiError) {
      writeFailureCache(ippureIP, ipapiError, ipapiServer);
    }
  }

  if (ippureIP && ipapi && valueAt(ipapi, 'ip', '')) {
    var checked = compareIPs(ippureIP, valueAt(ipapi, 'ip', ''));
    if (!checked.match) {
      mismatch = checked;
      ipapi = null;
      ipapiError = '双源IP不一致，已停止合并结果';
    }
  }

  if (!ippure && !ipapi) {
    throw new Error(
      'IPPure：' + (ippureError || '失败') +
      '；ipapi.is：' + (ipapiError || '失败')
    );
  }

  var report = renderReport({
    node: node,
    ippure: ippure || {},
    ippureError: ippureError,
    ipapi: ipapi || {},
    ipapiError: ipapiError,
    ipapiServer: ipapiServer,
    cacheState: cacheState,
    cacheAge: cacheAge,
    mismatch: mismatch
  });

  title = report.title;
  content = report.content;
  htmlMessage = report.html;
})()
  .catch(function (error) {
    title = 'IP纯净度检测失败';
    content = '错误：' + errorText(error) + '\n节点：' + (getNodeName() || '未知');
    htmlMessage = plainHtml(content);
  })
  .finally(function () {
    $done({ title: title, content: content, htmlMessage: htmlMessage });
  });

async function queryIpapi(expectedIP, node) {
  var errors = [];
  var mismatches = [];
  var query = expectedIP ? '?q=' + encodeURIComponent(expectedIP) : '';
  var route = expectedIP ? 'DIRECT' : (node || undefined);
  var i;

  for (i = 0; i < IPAPI_SERVERS.length; i++) {
    var server = IPAPI_SERVERS[i];
    try {
      var data = await requestJson({
        url: server[1] + query,
        node: route,
        timeout: 5000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Loon IP Checker/5.6'
        }
      }, 'ipapi.is');

      var returnedIP = valueAt(data, 'ip', '');
      if (!returnedIP) {
        throw new Error(valueAt(data, 'message', '未返回IP'));
      }

      if (expectedIP) {
        var checked = compareIPs(expectedIP, returnedIP);
        if (!checked.match) {
          mismatches.push(server[0] + '：' + returnedIP);
          continue;
        }
      }

      return { data: data, error: '', server: server[0], mismatch: null };
    } catch (error) {
      errors.push(server[0] + '：' + errorText(error));
    }
  }

  if (mismatches.length) {
    return {
      data: null,
      error: '双源IP不一致；' + mismatches.join('；'),
      server: '',
      mismatch: {
        match: false,
        ippureIP: expectedIP,
        ipapiIP: mismatches[0].replace(/^.*?：/, '')
      }
    };
  }

  return { data: null, error: errors.join('；'), server: '', mismatch: null };
}

function renderReport(ctx) {
  var p = ctx.ippure;
  var a = ctx.ipapi;
  var hasP = hasKeys(p);
  var hasA = hasKeys(a);

  var ipPair = pickFirst([
    [valueAt(p, 'ip', ''), 'IPPure'],
    [valueAt(a, 'ip', ''), 'ipapi.is']
  ]);
  var ip = ipPair[0];
  var isV6 = isIPv6(ip);

  var rawScore = Number(valueAt(p, 'fraudScore', NaN));
  var score = !isV6 && isFinite(rawScore) ? rawScore : null;

  var residential = toBoolean(valueAt(p, 'isResidential', null));
  var broadcast = toBoolean(valueAt(p, 'isBroadcast', null));
  var datacenter = toBoolean(valueAt(a, 'is_datacenter', null));
  var vpn = toBoolean(valueAt(a, 'is_vpn', null));
  var proxy = toBoolean(valueAt(a, 'is_proxy', null));
  var tor = toBoolean(valueAt(a, 'is_tor', null));
  var abuser = toBoolean(valueAt(a, 'is_abuser', null));
  var bogon = toBoolean(valueAt(a, 'is_bogon', null));
  var mobile = toBoolean(valueAt(a, 'is_mobile', null));

  var judgment = assessRisk({
    score: score,
    ipv6: isV6,
    hasIpapi: hasA,
    broadcast: broadcast,
    datacenter: datacenter,
    vpn: vpn,
    proxy: proxy,
    tor: tor,
    abuser: abuser,
    bogon: bogon
  });

  var pStatus = hasP
    ? (isV6 ? '基础信息正常 · IPv6不评分' : '正常')
    : '失败' + (ctx.ippureError ? ' · ' + shortError(ctx.ippureError) : '');

  var aStatus;
  if (ctx.mismatch) {
    aStatus = 'IP不一致 · 已停止合并';
  } else if (hasA) {
    aStatus = ctx.cacheAge >= 0
      ? '缓存 · ' + ageText(ctx.cacheAge) + '前'
      : '实时 · ' + (ctx.ipapiServer || '可用线路');
  } else if (ctx.cacheState === 'failure') {
    aStatus = '失败冷却 · ' + ageText(ctx.cacheAge) + '前';
  } else {
    aStatus = '失败' + (ctx.ipapiError ? ' · ' + shortError(ctx.ipapiError) : '');
  }

  var residentialText = residential === true
    ? '住宅 IP'
    : residential === false
      ? '非住宅 IP'
      : isV6 ? '未提供' : '未知';

  var nativeText = broadcast === true
    ? '广播 / 非原生'
    : broadcast === false
      ? '原生 IP'
      : isV6 ? '未提供' : '未知';

  var pLocation = uniqueValues([
    valueAt(p, 'country', ''),
    valueAt(p, 'region', ''),
    valueAt(p, 'city', '')
  ]);
  var aLocationObject = valueAt(a, 'location', {}) || {};
  var aLocation = uniqueValues([
    valueAt(aLocationObject, 'country', ''),
    valueAt(aLocationObject, 'state', ''),
    valueAt(aLocationObject, 'city', '')
  ]);

  var location = pLocation.length
    ? [(flag(valueAt(p, 'countryCode', '')) + ' ' + pLocation.join(' · ')).replace(/^\s+|\s+$/g, ''), 'IPPure']
    : aLocation.length
      ? [(flag(valueAt(aLocationObject, 'country_code', '')) + ' ' + aLocation.join(' · ')).replace(/^\s+|\s+$/g, ''), 'ipapi.is']
      : ['未知', '—'];

  var asnObject = valueAt(a, 'asn', {}) || {};
  var companyObject = valueAt(a, 'company', {}) || {};
  var ipapiAsn = valueAt(asnObject, 'asn', '');
  var ippureAsn = valueAt(p, 'asn', '');
  var asnType = translateType(valueAt(asnObject, 'type', valueAt(companyObject, 'type', '')));
  var asn = ipapiAsn
    ? ['AS' + String(ipapiAsn).replace(/^AS/i, '') + (asnType ? ' · ' + asnType : ''), 'ipapi.is']
    : ippureAsn
      ? ['AS' + String(ippureAsn).replace(/^AS/i, ''), 'IPPure']
      : ['未知', '—'];

  var ipapiOrg = valueAt(companyObject, 'name', valueAt(asnObject, 'org', ''));
  var ippureOrg = valueAt(p, 'asOrganization', '');
  var organization = ipapiOrg
    ? [ipapiOrg, 'ipapi.is']
    : ippureOrg
      ? [ippureOrg, 'IPPure']
      : ['未知', '—'];

  var ippureRows = [[
    statusCell('住宅属性', residentialText, residential === true ? 'good' : residential === false ? 'warn' : 'neutral'),
    statusCell('IP 属性', nativeText, nativeText === '原生 IP' ? 'good' : nativeText.indexOf('广播') >= 0 ? 'warn' : 'neutral')
  ]];

  var ipapiRows = [
    [statusCell('机房', yesNo(datacenter), infrastructureTone(datacenter)), statusCell('VPN', yesNo(vpn), infrastructureTone(vpn))],
    [statusCell('代理', yesNo(proxy), infrastructureTone(proxy)), statusCell('Tor', yesNo(tor), riskTone(tor))],
    [statusCell('滥用', yesNo(abuser), riskTone(abuser)), statusCell('移动网络', yesNo(mobile), mobile === null ? 'neutral' : 'info')]
  ];

  var details = [
    ['出口 IP', ip, ipPair[1], true],
    ['IP 协议', isV6 ? 'IPv6' : 'IPv4', '本地识别', false],
    ['国家地区', location[0], location[1], false],
    ['ASN', asn[0], asn[1], true],
    ['运营商', organization[0], organization[1], false],
    ['当前节点', ctx.node || '未知', 'Loon', false]
  ];

  var mismatchHtml = '';
  if (ctx.mismatch) {
    mismatchHtml = '<div style="margin:0 0 10px;padding:8px 10px;border:1px solid rgba(255,69,58,.45);border-radius:8px;color:#FF453A;font-size:12px;line-height:1.45;">' +
      '⚠️ 双源 IP 不一致<br>' +
      'IPPure：<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;">' + escapeHtml(ctx.mismatch.ippureIP || '未知') + '</span><br>' +
      'ipapi.is：<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;">' + escapeHtml(ctx.mismatch.ipapiIP || '未知') + '</span><br>' +
      '已停止合并 ipapi.is 结果，请重新检测。' +
      '</div>';
  }

  var topHtml;
  if (isV6) {
    topHtml = '<div style="text-align:center;padding:5px 0 13px;">' +
      '<div style="font-size:12px;color:#8E8E93;">IPv6 安全检测</div>' +
      '<div style="font-size:22px;font-weight:800;color:' + judgment.color + ';margin-top:7px;">' + escapeHtml(judgment.icon + ' ' + judgment.label) + '</div>' +
      '<div style="font-size:12px;color:#8E8E93;margin-top:6px;">主要依据 ipapi.is</div>' +
      '<div style="font-size:11px;color:#8E8E93;margin-top:2px;">IPPure 暂不提供 IPv6 风险评分</div>' +
      '</div>';
  } else {
    topHtml = '<div style="text-align:center;padding:5px 0 13px;">' +
      '<div style="font-size:12px;color:#8E8E93;">IPPure 风险评分</div>' +
      '<div style="font-size:46px;font-weight:800;color:' + judgment.color + ';line-height:1.05;">' +
        (score === null ? '--' : String(score)) +
        '<span style="font-size:15px;font-weight:600;">' + (score === null ? ' 无评分' : '/100') + '</span>' +
      '</div>' +
      '<div style="font-size:17px;font-weight:700;color:' + judgment.color + ';margin-top:5px;">' + escapeHtml(judgment.icon + ' ' + judgment.label) + '</div>' +
      '<div style="font-size:11px;color:#8E8E93;margin-top:3px;">本地综合判断 · IPPure + ipapi.is</div>' +
      '</div>';
  }

  var refresh = currentTime();
  var cacheNote = hasA
    ? (ctx.cacheAge >= 0 ? 'ipapi.is 缓存结果' : 'ipapi.is 实时查询 · ' + (ctx.ipapiServer || '可用线路'))
    : ctx.cacheState === 'failure'
      ? 'ipapi.is 失败冷却中'
      : 'ipapi.is 查询失败';

  var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'SF Pro Text\',sans-serif;font-size:15px;line-height:1.45;color:inherit;padding:2px 4px 4px;word-break:break-word;">' +
    topHtml +
    mismatchHtml +
    sectionHeader('IPPure 检测', pStatus, hasP) +
    statusTable(ippureRows) +
    sectionHeader('ipapi.is 检测', aStatus, hasA && !ctx.mismatch) +
    statusTable(ipapiRows) +
    sectionHeader('基础信息', '每行已标注来源', true) +
    '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">' + mapRows(details) + '</table>' +
    '<div style="font-size:11px;line-height:1.5;text-align:center;color:#8E8E93;margin-top:10px;">' +
      escapeHtml(cacheNote) + ' · 刷新 ' + refresh + '<br>' +
      '核心 5.6 · 综合判断仅供筛选' +
    '</div>' +
    '</div>';

  var text = [
    '【本地综合判断】' + judgment.label + '（' + (isV6 ? '主要依据ipapi.is' : 'IPPure + ipapi.is') + '）',
    ctx.mismatch ? '⚠️ 双源IP不一致，已停止合并ipapi.is结果' : '',
    '',
    '【IPPure】',
    '风险评分：' + (isV6 ? 'IPv6暂不评分' : score === null ? '未知' : score + '/100'),
    '住宅属性：' + residentialText,
    'IP属性：' + nativeText,
    '接口状态：' + pStatus,
    '',
    '【ipapi.is】',
    '机房：' + yesNo(datacenter),
    'VPN：' + yesNo(vpn),
    '代理：' + yesNo(proxy),
    'Tor：' + yesNo(tor),
    '滥用：' + yesNo(abuser),
    '移动网络：' + yesNo(mobile),
    '接口状态：' + aStatus,
    '',
    '【基础信息】',
    detailsToText(details),
    '',
    '刷新时间：' + refresh,
    '核心版本：5.6'
  ].filter(function (item) { return item !== ''; }).join('\n');

  return { title: 'IP纯净度 · ' + ip, content: text, html: html };
}

function assessRisk(x) {
  var critical = x.abuser === true || x.tor === true || x.bogon === true;
  var infrastructure = x.datacenter === true || x.vpn === true || x.proxy === true;

  if (critical || (!x.ipv6 && x.score !== null && x.score >= 70)) {
    return { label: '高风险', icon: '🔴', color: '#FF453A' };
  }
  if (!x.ipv6 && x.score !== null && x.score >= 40) {
    return { label: '风险偏高', icon: '🟠', color: '#FF9F0A' };
  }
  if (x.broadcast === true || (!x.ipv6 && x.score !== null && x.score >= 20)) {
    return { label: '纯净度一般', icon: '🟡', color: '#B89400' };
  }
  if (infrastructure) {
    return { label: '普通机房节点', icon: '🔵', color: '#467FCF' };
  }
  if (!x.ipv6 && x.score !== null) {
    return { label: '较为纯净', icon: '🟢', color: '#30A84A' };
  }
  if (x.ipv6 && x.hasIpapi && allKnownSafe([x.abuser, x.tor, x.bogon, x.vpn, x.proxy, x.datacenter])) {
    return { label: '未发现明显风险', icon: '🟢', color: '#30A84A' };
  }
  return { label: '信息不足', icon: '⚪', color: '#8E8E93' };
}

function writeSuccessCache(ip, data, server) {
  try {
    var ttl = cacheTTLForData(data);
    var payload = {
      kind: 'success',
      time: Date.now(),
      expires: Date.now() + ttl,
      ttl: ttl,
      data: data,
      server: server
    };
    $persistentStore.write(JSON.stringify(payload), CACHE_PREFIX + cacheKey(ip));
  } catch (error) {}
}

function writeFailureCache(ip, error, server) {
  try {
    var payload = {
      kind: 'failure',
      time: Date.now(),
      expires: Date.now() + TTL_FAILURE,
      error: shortError(error),
      server: server || ''
    };
    $persistentStore.write(JSON.stringify(payload), CACHE_PREFIX + cacheKey(ip));
  } catch (e) {}
}

function readCache(ip) {
  try {
    var raw = $persistentStore.read(CACHE_PREFIX + cacheKey(ip));
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || !data.time) return null;
    var expires = Number(data.expires || 0);
    if (!expires) {
      expires = Number(data.time) + (data.kind === 'failure' ? TTL_FAILURE : TTL_NORMAL);
    }
    if (Date.now() > expires) return null;
    return data;
  } catch (error) {
    return null;
  }
}

function cacheTTLForData(data) {
  var required = ['is_datacenter', 'is_vpn', 'is_proxy', 'is_tor', 'is_abuser', 'is_bogon'];
  var complete = true;
  var i;
  for (i = 0; i < required.length; i++) {
    if (toBoolean(valueAt(data, required[i], null)) === null) {
      complete = false;
      break;
    }
  }
  var risky = toBoolean(valueAt(data, 'is_abuser', null)) === true ||
    toBoolean(valueAt(data, 'is_tor', null)) === true ||
    toBoolean(valueAt(data, 'is_bogon', null)) === true;
  return complete && !risky ? TTL_NORMAL : TTL_RISK;
}

function compareIPs(left, right) {
  var a = normalizeIP(left);
  var b = normalizeIP(right);
  return { match: a !== '' && a === b, ippureIP: left || '', ipapiIP: right || '' };
}

function normalizeIP(ip) {
  return String(ip || '').replace(/^\[|\]$/g, '').replace(/^\s+|\s+$/g, '').toLowerCase();
}

function requestJson(options, source) {
  return new Promise(function (resolve, reject) {
    $httpClient.get(options, function (error, response, body) {
      if (error) {
        reject(new Error(String(error)));
        return;
      }
      var status = Number(response && (response.status || response.statusCode) || 0);
      if (status && (status < 200 || status >= 300)) {
        reject(new Error('HTTP ' + status));
        return;
      }
      var raw = String(body || '').replace(/^\s+|\s+$/g, '');
      if (!raw) {
        reject(new Error(source + ' 返回空内容'));
        return;
      }
      try {
        var data = JSON.parse(raw);
        if (data && data.error) {
          reject(new Error(String(data.error)));
          return;
        }
        if (data && data.message && !data.ip) {
          reject(new Error(String(data.message)));
          return;
        }
        resolve(data);
      } catch (parseError) {
        reject(new Error(source + ' JSON解析失败'));
      }
    });
  });
}

function sectionHeader(name, state, ok) {
  return '<table style="width:100%;border-collapse:collapse;margin:0 0 3px;">' +
    '<tr>' +
    '<td style="padding:4px 2px;font-size:14px;font-weight:750;">' + escapeHtml(name) + '</td>' +
    '<td style="padding:4px 2px;text-align:right;font-size:11px;color:' + (ok ? '#30A84A' : '#FF453A') + ';">' + escapeHtml(state) + '</td>' +
    '</tr></table>';
}

function statusTable(rows) {
  var html = '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 11px;">';
  var i;
  for (i = 0; i < rows.length; i++) {
    html += '<tr>' +
      '<td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18);">' + rows[i][0] + '</td>' +
      '<td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18);">' + rows[i][1] + '</td>' +
      '</tr>';
  }
  return html + '</table>';
}

function statusCell(label, text, tone) {
  var colors = { good: '#30A84A', warn: '#FF9F0A', bad: '#FF453A', info: '#467FCF', neutral: '#8E8E93' };
  var color = colors[tone] || colors.neutral;
  return '<span style="font-size:11px;color:#8E8E93;">' + escapeHtml(label) + '</span><br>' +
    '<span style="font-size:14px;font-weight:700;color:' + color + ';">' + (tone === 'neutral' ? '○' : '●') + ' ' + escapeHtml(text) + '</span>';
}

function mapRows(details) {
  var html = '';
  var i;
  for (i = 0; i < details.length; i++) html += detailRow(details[i]);
  return html;
}

function detailRow(item) {
  var mono = item[3] ? 'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;overflow-wrap:anywhere;' : '';
  return '<tr>' +
    '<td style="width:31%;padding:8px 6px 8px 2px;border-bottom:1px solid rgba(128,128,128,.16);">' +
      '<span style="color:#8E8E93;">' + escapeHtml(item[0]) + '</span><br>' +
      '<span style="font-size:10px;color:#467FCF;">来源：' + escapeHtml(item[2]) + '</span>' +
    '</td>' +
    '<td style="width:69%;padding:8px 2px 8px 6px;text-align:right;font-weight:600;border-bottom:1px solid rgba(128,128,128,.16);' + mono + '">' + escapeHtml(item[1]) + '</td>' +
    '</tr>';
}

function detailsToText(details) {
  var lines = [];
  var i;
  for (i = 0; i < details.length; i++) {
    lines.push(details[i][0] + '：' + details[i][1] + '（' + details[i][2] + '）');
  }
  return lines.join('\n');
}

function getNodeName() {
  try {
    if ($environment && $environment.params && $environment.params.node) {
      return String($environment.params.node);
    }
  } catch (e) {}
  return '';
}

function valueAt(object, path, fallback) {
  try {
    var parts = String(path).split('.');
    var current = object;
    var i;
    for (i = 0; i < parts.length; i++) {
      if (current === null || typeof current === 'undefined') return fallback;
      current = current[parts[i]];
    }
    return current === null || typeof current === 'undefined' ? fallback : current;
  } catch (e) {
    return fallback;
  }
}

function pickFirst(items) {
  var i;
  for (i = 0; i < items.length; i++) {
    if (items[i] && items[i][0] !== null && typeof items[i][0] !== 'undefined' && String(items[i][0]) !== '') return items[i];
  }
  return ['未知', '—'];
}

function hasKeys(object) {
  try { return object && Object.keys(object).length > 0; } catch (e) { return false; }
}

function toBoolean(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function yesNo(value) {
  return value === true ? '是' : value === false ? '否' : '未知';
}

function riskTone(value) {
  return value === true ? 'bad' : value === false ? 'good' : 'neutral';
}

function infrastructureTone(value) {
  return value === true ? 'info' : value === false ? 'good' : 'neutral';
}

function allKnownSafe(values) {
  var i;
  for (i = 0; i < values.length; i++) if (values[i] !== false) return false;
  return true;
}

function isIPv6(ip) {
  return typeof ip === 'string' && ip.indexOf(':') >= 0;
}

function uniqueValues(values) {
  var output = [];
  var i;
  for (i = 0; i < values.length; i++) {
    if (values[i] && output.indexOf(values[i]) < 0) output.push(values[i]);
  }
  return output;
}

function translateType(value) {
  var map = {
    isp: 'ISP',
    hosting: '托管/机房',
    business: '商业网络',
    education: '教育网络',
    government: '政府网络',
    banking: '金融网络'
  };
  var key = String(value || '').toLowerCase();
  return map[key] || String(value || '');
}

function flag(code) {
  var text = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(text)) return '🌐';
  return String.fromCodePoint(127397 + text.charCodeAt(0), 127397 + text.charCodeAt(1));
}

function ageText(milliseconds) {
  var minutes = Math.floor(Number(milliseconds || 0) / 60000);
  if (minutes < 1) return '不足1分钟';
  if (minutes < 60) return minutes + '分钟';
  return Math.floor(minutes / 60) + '小时';
}

function currentTime() {
  var date = new Date();
  return two(date.getHours()) + ':' + two(date.getMinutes()) + ':' + two(date.getSeconds());
}

function two(number) {
  return number < 10 ? '0' + number : String(number);
}

function cacheKey(value) {
  return String(value || '').replace(/[^0-9a-zA-Z]/g, '_');
}

function shortError(value) {
  var text = String(value || '').replace(/\s+/g, ' ');
  return text.length > 70 ? text.slice(0, 70) + '…' : text;
}

function errorText(error) {
  return String(error && (error.message || error.error) || error || '未知错误');
}

function escapeHtml(value) {
  return String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainHtml(text) {
  return '<div style="font-family:-apple-system;font-size:15px;line-height:1.55;">' +
    escapeHtml(text).replace(/\n/g, '<br>') +
    '</div>';
}
