/*
 * IPPure IP纯净度检测 - Loon Generic Script
 * 数据接口：https://my.ippure.com/v1/info
 *
 * 使用方式：
 * 在 Loon 的节点列表长按任意节点，选择“脚本”→“IPPure纯净度检测”。
 */

var API_URL = "https://my.ippure.com/v1/info";
var REQUEST_TIMEOUT = 12000;

function getEnvironmentParams() {
  try {
    if (typeof $environment !== "undefined" && $environment && $environment.params) {
      return $environment.params;
    }
  } catch (e) {}
  return {};
}

function getNodeName(params) {
  if (!params) return "";

  if (typeof params.node === "string" && params.node.length > 0) {
    return params.node;
  }

  var info = params.nodeInfo;

  if (typeof info === "string" && info.length > 0) {
    return info;
  }

  if (info && typeof info === "object") {
    var candidates = [
      info.name,
      info.tag,
      info.node,
      info.nodeName,
      info.policy,
      info.policyName
    ];

    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] === "string" && candidates[i].length > 0) {
        return candidates[i];
      }
    }
  }

  return "";
}

function safeText(value, fallback) {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback || "未知";
  }
  return String(value);
}

function toBooleanLabel(value, trueLabel, falseLabel) {
  if (value === true) return trueLabel;
  if (value === false) return falseLabel;
  return "未知";
}

function riskLevel(score) {
  if (typeof score !== "number" || isNaN(score)) {
    return "⚪ 未知";
  }
  if (score <= 10) return "🟢 极低风险";
  if (score <= 30) return "🟢 低风险";
  if (score <= 50) return "🟡 中等风险";
  if (score <= 70) return "🟠 较高风险";
  return "🔴 高风险";
}

function countryFlag(countryCode) {
  if (!countryCode || typeof countryCode !== "string" || countryCode.length !== 2) {
    return "🌐";
  }

  var code = countryCode.toUpperCase();
  var first = code.charCodeAt(0);
  var second = code.charCodeAt(1);

  if (first < 65 || first > 90 || second < 65 || second > 90) {
    return "🌐";
  }

  return String.fromCodePoint(127397 + first, 127397 + second);
}

function parseJson(body) {
  if (typeof body !== "string") {
    throw new Error("接口返回内容不是文本");
  }

  var cleaned = body.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    throw new Error("接口返回内容为空");
  }

  return JSON.parse(cleaned);
}

function finish() {
  try {
    $done();
  } catch (e) {}
}

function notify(title, subtitle, body, attachment) {
  try {
    if (attachment) {
      $notification.post(title, subtitle, body, attachment);
    } else {
      $notification.post(title, subtitle, body);
    }
  } catch (e) {
    console.log(title + "\n" + subtitle + "\n" + body);
  }
}

var params = getEnvironmentParams();
var nodeName = getNodeName(params);

var requestOptions = {
  url: API_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    "Accept": "application/json",
    "User-Agent": "Loon IPPure Node Checker/1.0"
  },
  "auto-redirect": true,
  "auto-cookie": false
};

/*
 * node 参数用于确保检测请求从当前长按选择的节点发出。
 * 某些旧版 Loon 只提供 params.node；新版可能同时提供 nodeInfo。
 */
if (nodeName) {
  requestOptions.node = nodeName;
}

$httpClient.get(requestOptions, function (error, response, body) {
  try {
    if (error) {
      throw new Error("网络请求失败：" + error);
    }

    var status = response && response.status;
    if (typeof status === "number" && (status < 200 || status >= 300)) {
      throw new Error("IPPure 接口返回 HTTP " + status);
    }

    var data = parseJson(body);

    if (!data || !data.ip) {
      throw new Error("接口未返回有效 IP 信息");
    }

    var score = Number(data.fraudScore);
    if (isNaN(score)) score = null;

    var flag = countryFlag(data.countryCode);
    var locationParts = [];
    if (data.country) locationParts.push(data.country);
    if (data.region) locationParts.push(data.region);
    if (data.city && data.city !== data.region) locationParts.push(data.city);

    var location = locationParts.length ? locationParts.join(" · ") : "未知";
    var residential = toBooleanLabel(data.isResidential, "住宅 IP", "机房 / 数据中心 IP");
    var nativeType = toBooleanLabel(data.isBroadcast, "广播 IP（非原生）", "原生 IP");
    var asn = data.asn !== null && typeof data.asn !== "undefined"
      ? "AS" + data.asn
      : "未知";

    var title = "IPPure IP纯净度检测";
    var subtitle = (nodeName ? nodeName + " ｜ " : "") +
      (score === null ? "风险未知" : "风险 " + score + "/100 " + riskLevel(score));

    var lines = [
      "出口 IP：" + safeText(data.ip),
      "位置：" + flag + " " + location,
      "ASN：" + asn,
      "运营商：" + safeText(data.asOrganization),
      "风险评分：" + (score === null ? "未知" : score + "/100"),
      "风险等级：" + riskLevel(score),
      "网络类型：" + residential,
      "IP 属性：" + nativeType,
      "时区：" + safeText(data.timezone)
    ];

    notify(title, subtitle, lines.join("\n"), {
      openUrl: "https://ippure.com/",
      clipboard: String(data.ip)
    });
  } catch (e) {
    var rawPreview = "";
    try {
      if (typeof body === "string" && body.length > 0) {
        rawPreview = "\n返回内容：" + body.slice(0, 160);
      }
    } catch (_) {}

    notify(
      "IPPure 检测失败",
      nodeName || "当前节点",
      safeText(e && e.message, "未知错误") + rawPreview
    );
  } finally {
    finish();
  }
});
