/*
 * IPPure IP Purity Detection for Loon Generic Script
 * ES5-compatible version, cache-busted as v3.
 */

var API_URL = "https://my.ippure.com/v1/info";
var finished = false;
var inputParams = {};
var nodeName = "";

try {
    inputParams = $environment.params || {};
    nodeName = inputParams.node || "";
} catch (e) {
    inputParams = {};
    nodeName = "";
}

function escapeHtml(value) {
    if (value === null || typeof value === "undefined") return "未知";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function boolText(value, yesText, noText) {
    if (value === true) return yesText;
    if (value === false) return noText;
    return "未知";
}

function riskText(score) {
    if (score === null || typeof score === "undefined" || isNaN(score)) return "未知";
    if (score <= 10) return "极低风险";
    if (score <= 30) return "低风险";
    if (score <= 50) return "中等风险";
    if (score <= 70) return "较高风险";
    return "高风险";
}

function finish(title, html) {
    if (finished) return;
    finished = true;

    if (!html) {
        html = '<p style="text-align:center;font-family:-apple-system;font-size:16px;">脚本未返回内容</p>';
    }

    $done({
        "title": title || "IPPure IP纯净度检测",
        "htmlMessage": html
    });
}

function errorPage(message) {
    return '<p style="text-align:center;font-family:-apple-system;font-size:16px;line-height:1.7;">' +
        '<b>IPPure 检测失败</b><br><br>' +
        escapeHtml(message) +
        '<br><br><font color="#888888">节点：' + escapeHtml(nodeName || "未获取到节点名称") + '</font></p>';
}

/* 防止接口或回调卡死导致 Loon 收到空内容 */
setTimeout(function () {
    finish("IPPure 检测超时", errorPage("请求超过 11 秒，请检查节点连通性或 IPPure 接口状态。"));
}, 11000);

try {
    var requestParams = {
        "url": API_URL,
        "timeout": 10000,
        "headers": {
            "Accept": "application/json",
            "User-Agent": "Loon/IPPure-v3"
        },
        "auto-redirect": true,
        "auto-cookie": false
    };

    if (nodeName) {
        requestParams.node = nodeName;
    }

    $httpClient.get(requestParams, function (error, response, body) {
        if (finished) return;

        try {
            if (error) {
                finish("IPPure 检测失败", errorPage("网络请求失败：" + error));
                return;
            }

            var status = response && response.status ? response.status : 0;
            if (status < 200 || status >= 300) {
                finish("IPPure 检测失败", errorPage("接口返回 HTTP " + status));
                return;
            }

            if (!body || typeof body !== "string") {
                finish("IPPure 检测失败", errorPage("接口返回内容为空。"));
                return;
            }

            var data;
            try {
                data = JSON.parse(body);
            } catch (parseError) {
                finish("IPPure 检测失败", errorPage("JSON 解析失败：" + parseError));
                return;
            }

            if (!data || !data.ip) {
                finish("IPPure 检测失败", errorPage("接口没有返回有效 IP。"));
                return;
            }

            var score = Number(data.fraudScore);
            if (isNaN(score)) score = null;

            var asn = data.asn !== null && typeof data.asn !== "undefined" ? "AS" + data.asn : "未知";
            var location = [];
            if (data.country) location.push(data.country);
            if (data.region) location.push(data.region);
            if (data.city && data.city !== data.region) location.push(data.city);

            var html = '<div style="font-family:-apple-system;font-size:16px;line-height:1.75;padding:2px 4px;">' +
                '<div style="text-align:center;font-size:21px;font-weight:700;margin-bottom:10px;">' + escapeHtml(data.ip) + '</div>' +
                '<b>风险评分：</b>' + escapeHtml(score === null ? "未知" : score + "/100") + '<br>' +
                '<b>风险等级：</b>' + escapeHtml(riskText(score)) + '<br>' +
                '<b>国家地区：</b>' + escapeHtml(location.length ? location.join(" · ") : "未知") + '<br>' +
                '<b>ASN：</b>' + escapeHtml(asn) + '<br>' +
                '<b>运营商：</b>' + escapeHtml(data.asOrganization || "未知") + '<br>' +
                '<b>网络类型：</b>' + escapeHtml(boolText(data.isResidential, "住宅 IP", "机房 / 数据中心 IP")) + '<br>' +
                '<b>IP 属性：</b>' + escapeHtml(boolText(data.isBroadcast, "广播 IP（非原生）", "原生 IP")) + '<br>' +
                '<b>时区：</b>' + escapeHtml(data.timezone || "未知") + '<br>' +
                '<div style="margin-top:10px;color:#777777;font-size:13px;word-break:break-all;"><b>节点：</b>' + escapeHtml(nodeName || "未知") + '</div>' +
                '</div>';

            finish("IPPure IP纯净度检测 · V3", html);
        } catch (callbackError) {
            finish("IPPure 脚本异常", errorPage("回调异常：" + callbackError));
        }
    });
} catch (startupError) {
    finish("IPPure 脚本异常", errorPage("启动异常：" + startupError));
}
