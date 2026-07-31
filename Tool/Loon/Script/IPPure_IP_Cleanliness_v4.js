const NAME = 'ippure-node-check'
const $ = new Env(NAME)

const API_URL = 'https://my.ippure.com/v1/info'

let title = 'IPPure IP纯净度检测'
let content = '正在查询 IPPure，请稍候…'
let htmlMessage = toHtml(content)

!(async () => {
  $.log(`运行环境: ${$.getEnv()}`)
  $.log(`节点交互: ${isInteraction()}`)
  $.log(`节点参数: ${$.toStr(getNodeOpt())}`)

  const response = await $.http.get({
    ...getNodeOpt(),
    url: API_URL,
    timeout: 10000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Loon IPPure Node Checker/4.0',
    },
    'auto-redirect': true,
    'auto-cookie': false,
  })

  const status = Number(response?.status || response?.statusCode || 0)
  if (status < 200 || status >= 300) {
    throw new Error(`IPPure 接口返回 HTTP ${status || '未知'}`)
  }

  const rawBody = String(response?.body || '')
  if (!rawBody.trim()) {
    throw new Error('IPPure 接口返回空内容')
  }

  let data
  try {
    data = JSON.parse(rawBody)
  } catch (e) {
    throw new Error(`IPPure JSON 解析失败：${rawBody.slice(0, 120)}`)
  }

  if (!data?.ip) {
    throw new Error('IPPure 未返回有效 IP')
  }

  const scoreNumber = Number(data.fraudScore)
  const score = Number.isFinite(scoreNumber) ? scoreNumber : null
  const nodeName = getNodeName()
  const location = [data.country, data.region, data.city]
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .join(' · ')

  const lines = [
    `出口 IP: ${data.ip}`,
    `风险评分: ${score === null ? '未知' : `${score}/100`}`,
    `风险等级: ${riskLevel(score)}`,
    `国家地区: ${location || '未知'}`,
    `ASN: ${data.asn ?? '未知'}`,
    `运营商: ${data.asOrganization || '未知'}`,
    `网络类型: ${boolText(data.isResidential, '住宅 IP', '机房 / 数据中心 IP')}`,
    `IP 属性: ${boolText(data.isBroadcast, '广播 IP（非原生）', '原生 IP')}`,
    `时区: ${data.timezone || '未知'}`,
    `节点: ${nodeName || '未获取到节点名称'}`,
  ]

  title = `IPPure · ${data.ip}`
  content = lines.join('\n')
  htmlMessage = toHtml(content)
})()
  .catch(error => {
    $.logErr(error)
    title = 'IPPure 检测失败'
    content = [
      `错误: ${error?.message || error}`,
      `节点: ${getNodeName() || '未获取到节点名称'}`,
      `交互模式: ${isInteraction() ? '是' : '否'}`,
    ].join('\n')
    htmlMessage = toHtml(content)
  })
  .finally(() => {
    const result = {
      title,
      content,
      htmlMessage,
    }
    $.log(`返回结果: ${$.toStr(result)}`)
    $.done(result)
  })

function getNodeName() {
  try {
    return $environment?.params?.node || ''
  } catch (e) {
    return ''
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
  if (isInteraction()) {
    return {
      node: $environment.params.node,
    }
  }
  return {}
}

function boolText(value, trueText, falseText) {
  if (value === true) return trueText
  if (value === false) return falseText
  return '未知'
}

function riskLevel(score) {
  if (score === null || !Number.isFinite(score)) return '未知'
  if (score <= 10) return '🟢 极低风险'
  if (score <= 30) return '🟢 低风险'
  if (score <= 50) return '🟡 中等风险'
  if (score <= 70) return '🟠 较高风险'
  return '🔴 高风险'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toHtml(text) {
  const html = escapeHtml(text)
    .replace(/^(.*?):/gim, '<span style="font-weight:600">$1</span>:')
    .replace(/\n/g, '<br/>')

  return `<div style="font-family:-apple-system;font-size:16px;line-height:1.65;word-break:break-word">${html}</div>`
}

function Env(name) {
  class Http {
    constructor(env) {
      this.env = env
    }

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
      this.http = new Http(this)
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
