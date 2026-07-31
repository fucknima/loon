/*
 * IPPure IP纯净度检测 - Loon Generic Script
 * 数据接口：https://my.ippure.com/v1/info
 *
 * 用于：Loon 节点列表长按节点 → 脚本 → IPPure纯净度检测
 */

var API_URL = "https://my.ippure.com/v1/info";
var REQUEST_TIMEOUT = 12000;

function getParams() {
  try {
    if (typeof $environment !== "undefined" && $environment && $environment.params) {
      return $environment.params;
    }
  } catch (e) {}
  return {};
}

function getNodeName(params) {
  if (!params) return "";

  if (typeof params.node === "string" && params.node) {
    return params.node;
  }

  if (params.nodeInfo && typeof params.nodeInfo === "object") {
    return params.nodeInfo.name || params.nodeInfo.tag || "";
  }

  if (typeof params.nodeInfo === "string") {
    return params.nodeInfo;
  }

  return "";
}

function escapeHtml(value) {
  return String(value === null || typeof value === "undefined" ? "未知" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeText(value) {
  return value === null || typeof value === "undefined" || value === ""
    ? "未知"
    : String(value);
}

function boolText(value, yesText, noText) {
  if (value === true) return yesText;
  if (value === false) return noText;
  return "未知";
}

function riskInfo(score) {
  if (score === null || isNaN(score)) {
    return { text: "未知", icon: "⚪", color: "#8E8E93" };
  }
  if (score <= 10) return { text: "极低风险", icon: "🟢", color: "#34C759" };
  if (score <= 30) return { text: "低风险", icon: "🟢", color: "#34C759" };
  if (score <= 50) return { text: "中等风险", icon: "🟡", color: "#FFCC00" };
  if (score <= 70) return { text: "较高风险", icon: "🟠", color: "#FF9500" };
  return { text: "高风险", icon: "🔴", color: "#FF3B30" };
}

function codePointToString(codePoint) {
  if (codePoint <= 0xFFFF) return String.fromCharCode(codePoint);
  codePoint -= 0x10000;
  return String.fromCharCode(
    0xD800 + (codePoint >> 10),
    0xDC00 + (codePoint & 0x3FF)
  );
}

function countryFlag(code) {
  if (!code || typeof code !== "string" || code.length !== 2) return "🌐";
  code = code.toUpperCase();
  var a = code.charCodeAt(0);
  var b = code.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return "🌐";
  return codePointToString(127397 + a) + codePointToString(127397 + b);
}

function parseJson(body) {
  if (typeof body !== "string") throw new Error("接口返回内容不是文本");
  var text = body.replace(/^\uFEFF/, "").replace(/^\s+|\s+$/g, "");
  if (!text) throw new Error("IPPure 接口返回内容为空");
  return JSON.parse(text);
}

function row(label, value) {
  return '<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid rgba(128,128,128,.18);">' +
    '<span style="color:#8E8E93;white-space:nowrap;">' + escapeHtml(label) + '</span>' +
    '<span style="text-align:right;word-break:break-all;font-weight:600;">' + escapeHtml(value) + '</span>' +
    '</div>';
}

function showResult(title, html) {
  $done({
    title: title,
    htmlMessage: html
  });
}

function showError(nodeName, message, rawBody) {
  var detail = safeText(message);
  if (rawBody) {
    detail += "\n" + String(rawBody).slice(0, 180);
  }

  var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:8px 2px;">' +
    '<div style="font-size:44px;text-align:center;margin:4px 0 10px;">⚠️</div>' +
    '<div style="font-size:18px;font-weight:700;text-align:center;margin-bottom:14px;">检测失败</div>' +
    row("节点", nodeName || "当前节点") +
    row("原因", detail) +
    '</div>';

  showResult("IPPure 检测失败", html);
}

var params = getParams();
var nodeName = getNodeName(params);

var requestOptions = {
  url: API_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    "Accept": "application/json",
    "User-Agent": "Loon-IPPure-Checker/2.0"
  },
  "auto-redirect": true,
  "auto-cookie": false
};

/* 强制检测请求从当前长按选中的节点发出 */
if (nodeName) {
  requestOptions.node = nodeName;
}

$httpClient.get(requestOptions, function (error, response, body) {
  if (error) {
    showError(nodeName, "网络请求失败：" + error, "");
    return;
  }

  var status = response && response.status ? Number(response.status) : 0;
  if (status && (status < 200 || status >= 300)) {
    showError(nodeName, "IPPure 接口返回 HTTP " + status, body);
    return;
  }

  try {
    var data = parseJson(body);
    if (!data || !data.ip) throw new Error("接口没有返回有效 IP 信息");

    var score = Number(data.fraudScore);
    if (isNaN(score)) score = null;

    var risk = riskInfo(score);
    var flag = countryFlag(data.countryCode);
    var location = [];
    if (data.country) location.push(data.country);
    if (data.region) location.push(data.region);
    if (data.city && data.city !== data.region) location.push(data.city);

    var asn = data.asn === null || typeof data.asn === "undefined"
      ? "未知"
      : "AS" + data.asn;

    var scoreText = score === null ? "未知" : score + " / 100";
    var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:4px 2px;color:inherit;">' +
      '<div style="text-align:center;padding:8px 0 14px;">' +
        '<div style="font-size:42px;line-height:1;">' + risk.icon + '</div>' +
        '<div style="font-size:24px;font-weight:800;margin-top:8px;color:' + risk.color + ';">' + escapeHtml(scoreText) + '</div>' +
        '<div style="font-size:16px;font-weight:700;margin-top:3px;">' + escapeHtml(risk.text) + '</div>' +
      '</div>' +
      '<div style="border-radius:14px;padding:4px 14px;background:rgba(128,128,128,.10);">' +
        row("节点", nodeName || "当前节点") +
        row("出口 IP", safeText(data.ip)) +
        row("位置", flag + " " + (location.length ? location.join(" · ") : "未知")) +
        row("ASN", asn) +
        row("运营商", safeText(data.asOrganization)) +
        row("网络类型", boolText(data.isResidential, "住宅 IP", "机房 / 数据中心 IP")) +
        row("IP 属性", boolText(data.isBroadcast, "广播 IP（非原生）", "原生 IP")) +
        row("时区", safeText(data.timezone)) +
      '</div>' +
      '<div style="font-size:12px;color:#8E8E93;text-align:center;margin-top:12px;">数据来源：IPPure</div>' +
    '</div>';

    showResult("IPPure IP纯净度检测", html);
  } catch (e) {
    showError(nodeName, e && e.message ? e.message : "解析失败", body);
  }
});
