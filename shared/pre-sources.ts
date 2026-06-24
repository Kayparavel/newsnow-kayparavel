import process from "node:process"
import { Interval } from "./consts"
import { typeSafeObjectFromEntries } from "./type.util"
import type { OriginSource, Source, SourceID } from "./types"

const Time = {
  Test: 1,
  Realtime: 3 * 60 * 1000,
  Fast: 5 * 60 * 1000,
  Default: Interval, // 10min
  Common: 30 * 60 * 1000,
  Slow: 60 * 60 * 1000,
}

export const originSources = {
  "v2ex": {
    name: "V2EX",
    color: "slate",
    home: "https://v2ex.com/",
    sub: {
      share: {
        title: "最新分享",
        column: "tech",
      },
    },
  },
  "zhihu": {
    name: "知乎",
    type: "hottest",
    column: "china",
    color: "blue",
    home: "https://www.zhihu.com",
  },
  "weibo": {
    name: "微博",
    title: "实时热搜",
    type: "hottest",
    column: "china",
    color: "red",
    interval: Time.Realtime,
    home: "https://weibo.com",
  },
  "zaobao": {
    name: "联合早报",
    interval: Time.Common,
    type: "realtime",
    column: "world",
    color: "red",
    desc: "来自第三方网站: 早晨报",
    home: "https://www.zaobao.com",
  },
  "coolapk": {
    name: "酷安",
    type: "hottest",
    column: "tech",
    color: "green",
    title: "今日最热",
    home: "https://coolapk.com",
  },
  "mktnews": {
    name: "MKTNews",
    column: "finance",
    home: "https://mktnews.net",
    color: "indigo",
    interval: Time.Realtime,
    sub: {
      "flash": {
        title: "快讯",
      },
      "flash-zh": {
        title: "快讯(译文)",
        dependsOn: "mktnews-flash",
      },
    },
  },
  "wallstreetcn": {
    name: "华尔街见闻",
    color: "blue",
    column: "finance",
    home: "https://wallstreetcn.com/",
    sub: {
      quick: {
        type: "realtime",
        interval: Time.Fast,
        title: "快讯",
      },
      news: {
        title: "最新",
        interval: Time.Common,
      },
      hot: {
        title: "最热",
        type: "hottest",
        interval: Time.Fast,
      },
    },
  },
  "36kr": {
    name: "36氪",
    type: "realtime",
    color: "blue",
    home: "https://36kr.com",
    column: "tech",
    sub: {
      quick: {
        title: "快讯",
      },
      renqi: {
        type: "hottest",
        title: "人气榜",
      },
    },
  },
  "douyin": {
    name: "抖音",
    type: "hottest",
    column: "china",
    color: "gray",
    home: "https://www.douyin.com",
  },
  "hupu": {
    name: "虎扑",
    home: "https://hupu.com",
    column: "china",
    title: "主干道热帖",
    type: "hottest",
    color: "red",
  },
  "tieba": {
    name: "百度贴吧",
    title: "热议",
    column: "china",
    type: "hottest",
    color: "blue",
    home: "https://tieba.baidu.com",
  },
  "toutiao": {
    name: "今日头条",
    type: "hottest",
    column: "china",
    color: "red",
    home: "https://www.toutiao.com",
  },
  "ithome": {
    name: "IT之家",
    color: "red",
    column: "tech",
    type: "realtime",
    home: "https://www.ithome.com",
  },
  "thepaper": {
    name: "澎湃新闻",
    interval: Time.Common,
    type: "hottest",
    column: "china",
    title: "热榜",
    color: "gray",
    home: "https://www.thepaper.cn",
  },
  "sputniknewscn": {
    name: "卫星通讯社",
    color: "orange",
    column: "world",
    home: "https://sputniknews.cn",
  },
  "cankaoxiaoxi": {
    name: "参考消息",
    color: "red",
    column: "world",
    interval: Time.Common,
    home: "https://china.cankaoxiaoxi.com",
  },
  "pcbeta": {
    name: "远景论坛",
    color: "blue",
    column: "tech",
    home: "https://bbs.pcbeta.com",
    sub: {
      windows11: {
        title: "Win11",
        type: "realtime",
        interval: Time.Fast,
      },
      windows: {
        title: "Windows 资源",
        type: "realtime",
        interval: Time.Fast,
        disable: true,
      },
    },
  },
  "cls": {
    name: "财联社",
    color: "red",
    column: "finance",
    home: "https://www.cls.cn",
    sub: {
      telegraph: {
        title: "电报",
        interval: Time.Fast,
        type: "realtime",
      },
      depth: {
        title: "深度",
      },
      hot: {
        title: "热门",
        type: "hottest",
      },
    },
  },
  "xueqiu": {
    name: "雪球",
    color: "blue",
    home: "https://xueqiu.com",
    column: "finance",
    sub: {
      hotstock: {
        title: "热门股票",
        interval: Time.Realtime,
        type: "hottest",
      },
    },
  },
  "gelonghui": {
    name: "格隆汇",
    color: "blue",
    title: "事件",
    column: "finance",
    type: "realtime",
    interval: Time.Realtime,
    home: "https://www.gelonghui.com",
  },
  "fastbull": {
    name: "法布财经",
    color: "emerald",
    home: "https://www.fastbull.cn",
    column: "finance",
    sub: {
      "today": {
        title: "今日日历",
        type: "realtime",
        interval: Time.Common,
      },
      "tomorrow": {
        title: "明日日历",
        type: "realtime",
        interval: Time.Common,
      },
      "this-week": {
        title: "本周日历",
        type: "realtime",
        interval: Time.Common,
      },
      "next-week": {
        title: "下周日历",
        type: "realtime",
        interval: Time.Common,
      },
      "news": {
        title: "头条",
        interval: Time.Common,
      },
    },
  },
  "mysteel": {
    name: "我的钢铁",
    type: "realtime",
    column: "finance",
    home: "https://www.mysteel.com",
    color: "blue",
    interval: Time.Fast,
    title: "钢铁快讯",
  },
  "jiemian": {
    name: "界面新闻",
    type: "realtime",
    column: "china",
    home: "https://www.jiemian.com",
    color: "blue",
    sub: {
      quick: {
        title: "即时资讯",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true,
      },
      todayhot: {
        title: "今日热点",
        type: "realtime",
        staggerRefresh: true,
      },
      company: {
        title: "公司头条",
        type: "realtime",
        interval: Time.Common,
        staggerRefresh: true,
      },
      stock: {
        title: "股市前沿",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true,
      },
      regulatory: {
        title: "监管通报",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
      },
      finance: {
        title: "财经速览",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
      },
      affairs: {
        title: "时事追踪",
        type: "realtime",
        interval: Time.Realtime,
        staggerRefresh: true,
      },
    },
  },
  "solidot": {
    name: "Solidot",
    color: "teal",
    column: "tech",
    home: "https://solidot.org",
    interval: Time.Slow,
  },
  "hackernews": {
    name: "Hacker News",
    color: "orange",
    column: "tech",
    home: "https://news.ycombinator.com/",
    sub: {
      "hot": {
        title: "热门",
        type: "hottest",
      },
      "hot-zh": {
        title: "热门(译文)",
        type: "hottest",
        dependsOn: "hackernews-hot",
      },
    },
  },
  "producthunt": {
    name: "Product Hunt",
    color: "red",
    column: "tech",
    type: "hottest",
    home: "https://www.producthunt.com/",
  },
  "github": {
    name: "Github",
    color: "gray",
    home: "https://github.com/",
    column: "tech",
    sub: {
      "trending-today": {
        title: "Today",
        type: "hottest",
      },
    },
  },
  "bilibili": {
    name: "哔哩哔哩",
    color: "blue",
    home: "https://www.bilibili.com",
    sub: {
      "hot-search": {
        title: "热搜",
        column: "china",
        type: "hottest",
      },
      "hot-video": {
        title: "热门视频",
        disable: "cf",
        column: "entertainment",
        type: "hottest",
      },
      "ranking": {
        title: "排行榜",
        column: "entertainment",
        disable: "cf",
        type: "hottest",
        interval: Time.Common,
      },
    },
  },
  "kuaishou": {
    name: "快手",
    type: "hottest",
    column: "china",
    color: "orange",
    // cloudflare pages cannot access
    disable: "cf",
    home: "https://www.kuaishou.com",
  },
  "kaopu": {
    name: "靠谱新闻",
    column: "world",
    color: "gray",
    interval: Time.Common,
    desc: "不一定靠谱，多看多思考",
    home: "https://kaopu.news/",
  },
  "eastmoney": {
    name: "东方财富",
    column: "finance",
    color: "red",
    home: "https://kuaixun.eastmoney.com",
    sub: {
      flash: {
        title: "7x24",
        type: "realtime",
        interval: Time.Realtime,
      },
      focus: {
        title: "焦点",
        type: "realtime",
      },
    },
  },
  "jin10": {
    name: "金十数据",
    column: "finance",
    color: "blue",
    type: "realtime",
    home: "https://www.jin10.com",
  },
  "baidu": {
    name: "百度热搜",
    column: "china",
    color: "blue",
    type: "hottest",
    home: "https://www.baidu.com",
  },
  "linuxdo": {
    name: "LINUX DO",
    column: "tech",
    color: "slate",
    home: "https://linux.do/",
    disable: true,
    sub: {
      latest: {
        title: "最新",
        home: "https://linux.do/latest",
      },
      hot: {
        title: "今日最热",
        type: "hottest",
        interval: Time.Common,
        home: "https://linux.do/hot",
      },
    },
  },
  "ghxi": {
    name: "果核剥壳",
    column: "china",
    color: "yellow",
    home: "https://www.ghxi.com/",
    disable: true,
  },
  "smzdm": {
    name: "什么值得买",
    column: "china",
    color: "red",
    type: "hottest",
    home: "https://www.smzdm.com",
    disable: true,
  },
  "nowcoder": {
    name: "牛客",
    column: "china",
    color: "blue",
    type: "hottest",
    home: "https://www.nowcoder.com",
  },
  "sspai": {
    name: "少数派",
    column: "tech",
    color: "red",
    type: "hottest",
    home: "https://sspai.com",
  },
  "juejin": {
    name: "稀土掘金",
    column: "tech",
    color: "blue",
    type: "hottest",
    home: "https://juejin.cn",
  },
  "ifeng": {
    name: "凤凰网",
    column: "china",
    color: "red",
    type: "hottest",
    title: "热点资讯",
    home: "https://www.ifeng.com",
  },
  "chongbuluo": {
    name: "虫部落",
    column: "china",
    color: "green",
    home: "https://www.chongbuluo.com",
    sub: {
      latest: {
        title: "最新",
        interval: Time.Common,
        home: "https://www.chongbuluo.com/forum.php?mod=guide&view=newthread",
      },
      hot: {
        title: "最热",
        type: "hottest",
        interval: Time.Common,
        home: "https://www.chongbuluo.com/forum.php?mod=guide&view=hot",
      },
    },
  },
  "douban": {
    name: "豆瓣",
    column: "entertainment",
    title: "热门电影",
    color: "green",
    type: "hottest",
    home: "https://www.douban.com",
  },
  "steam": {
    name: "Steam",
    column: "world",
    title: "在线人数",
    color: "blue",
    type: "hottest",
    home: "https://store.steampowered.com",
  },
  "reuters": {
    name: "路透社",
    column: "world",
    color: "orange",
    home: "https://www.reuters.com",
    sub: {
      "world": {
        title: "世界快讯",
        type: "realtime",
        staggerRefresh: true,
      },
      "business": {
        title: "商业快讯",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
      },
      "tech": {
        title: "科技快讯",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
      },
      "world-googlerss": {
        title: "G-RSS世界",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
      },
      // 译文源
      "world-zh": {
        title: "世界快讯(译文)",
        type: "realtime",
        staggerRefresh: true,
        dependsOn: "reuters-world",
      },
      "business-zh": {
        title: "商业快讯(译文)",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
        dependsOn: "reuters-business",
      },
      "tech-zh": {
        title: "科技快讯(译文)",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
        dependsOn: "reuters-tech",
      },
      "world-googlerss-zh": {
        title: "G-RSS世界(译文)",
        type: "realtime",
        interval: Time.Slow,
        staggerRefresh: true,
        dependsOn: "reuters-world-googlerss",
      },
    },
  },
  "bloomberg": {
    name: "彭博",
    column: "world",
    color: "gray",
    home: "https://www.bloomberg.com",
    sub: {
      "hot": {
        title: "热点",
        type: "hottest",
      },
      "market": {
        title: "市场动态",
        type: "realtime",
        interval: Time.Slow,
      },
      "us": {
        title: "欧美快讯",
        type: "realtime",
      },
      "ja": {
        title: "日本快讯",
        type: "realtime",
      },
      // 译文源
      "hot-zh": {
        title: "热点(译文)",
        type: "hottest",
        dependsOn: "bloomberg-hot",
      },
      "market-zh": {
        title: "市场动态(译文)",
        type: "realtime",
        interval: Time.Slow,
        dependsOn: "bloomberg-market",
      },
      "us-zh": {
        title: "欧美快讯(译文)",
        type: "realtime",
        dependsOn: "bloomberg-us",
      },
      "ja-zh": {
        title: "日本快讯(译文)",
        type: "realtime",
        dependsOn: "bloomberg-ja",
      },
    },
  },
  "tencent": {
    name: "腾讯新闻",
    column: "china",
    color: "blue",
    home: "https://news.qq.com",
    sub: {
      hot: {
        title: "综合早报",
        type: "hottest",
        home: "https://news.qq.com/tag/aEWqxLtdgmQ=",
      },
    },
  },
  "freebuf": {
    name: "Freebuf",
    column: "china",
    title: "网络安全",
    color: "green",
    type: "hottest",
    home: "https://www.freebuf.com/",
  },

  "qqvideo": {
    name: "腾讯视频",
    column: "entertainment",
    color: "blue",
    home: "https://v.qq.com/",
    sub: {
      "tv-hotsearch": {
        title: "热搜榜",
        type: "hottest",
        interval: Time.Common,
        home: "https://v.qq.com/channel/tv",

      },
    },
  },
  "iqiyi": {
    name: "爱奇艺",
    column: "entertainment",
    color: "green",
    home: "https://www.iqiyi.com",
    sub: {
      "hot-ranklist": {
        title: "热播榜",
        type: "hottest",
        interval: Time.Common,
        home: "https://www.iqiyi.com",
      },
    },
  },
  "polymarket": {
    name: "Polymarket",
    column: "world",
    color: "purple",
    home: "https://polymarket.com",
    sub: {
      new: {
        title: "最新",
        type: "polymarket",
        interval: Time.Fast,
        home: "https://polymarket.com/zh/new",
      },
      carousel: {
        title: "轮播",
        type: "polymarket",
        interval: Time.Fast,
        home: "https://polymarket.com/zh/new",
      },
      breaking: {
        title: "突发",
        type: "polymarket",
        interval: Time.Fast,
        home: "https://polymarket.com/zh/breaking",
      },
      trending: {
        title: "热门",
        type: "polymarket",
        interval: Time.Fast,
        home: "https://polymarket.com/zh",
      },
      zh: {
        title: "中文",
        type: "polymarket",
        interval: Time.Fast,
        home: "https://polymarket.com/zh",
      },
    },
  },
  "maoyan": {
    name: "猫眼票房",
    type: "hottest",
    column: "entertainment",
    color: "red",
    home: "https://piaofang.maoyan.com",
    sub: {
      boxoffice: {
        title: "实时票房",
      },
      tvviewing: {
        title: "节目收视",
      },
      webheat: {
        title: "网络热播",
      },
    },
  },
  "guancha": {
    name: "观察者网",
    column: "china",
    color: "red",
    type: "realtime",
    interval: Time.Common,
    home: "https://www.guancha.cn",
  },
  "sohu": {
    name: "搜狐新闻",
    column: "china",
    color: "red",
    type: "realtime",
    interval: Time.Common,
    home: "https://news.sohu.com",
  },
  "apnews": {
    name: "AP News",
    column: "world",
    color: "red",
    home: "https://apnews.com",
    sub: {
      "news": {
        title: "最新",
        type: "realtime",
        interval: Time.Test,
      },
      "news-zh": {
        title: "最新(译文)",
        type: "realtime",
        interval: Time.Test,
        dependsOn: "apnews-news",
      },
    },
  },
  "bbc": {
    name: "BBC",
    column: "world",
    color: "red",
    home: "https://www.bbc.com/news",
    sub: {
      "news": {
        title: "最新",
        type: "realtime",
        interval: Time.Common,
      },
      "news-zh": {
        title: "最新(译文)",
        type: "realtime",
        interval: Time.Common,
        dependsOn: "bbc-news",
      },
    },
  },
  "music163": {
    name: "网易云音乐",
    column: "entertainment",
    color: "red",
    type: "hottest",
    interval: Time.Common,
    home: "https://music.163.com",
  },
  "qidian": {
    name: "起点中文网",
    column: "entertainment",
    color: "red",
    type: "hottest",
    interval: Time.Common,
    home: "https://www.qidian.com",
  },
  "taptap": {
    name: "TapTap",
    column: "entertainment",
    color: "blue",
    type: "hottest",
    interval: Time.Common,
    home: "https://www.taptap.cn",
    sub: {
      hot: {
        title: "热门榜",
      },
      sell: {
        title: "热卖榜",
      },
    },
  },
} as const satisfies Record<string, OriginSource>

export function genSources() {
  const _: [SourceID, Source][] = []

  Object.entries(originSources).forEach(([id, source]: [any, OriginSource]) => {
    const parent = {
      name: source.name,
      type: source.type,
      disable: source.disable,
      desc: source.desc,
      column: source.column,
      home: source.home,
      color: source.color ?? "primary",
      interval: source.interval ?? Time.Default,
    }
    if (source.sub && Object.keys(source.sub).length) {
      Object.entries(source.sub).forEach(([subId, subSource], i) => {
        if (i === 0) {
          _.push([
            id,
            {
              redirect: `${id}-${subId}`,
              ...parent,
              ...subSource,
            },
          ] as [any, Source])
        }
        _.push([`${id}-${subId}`, { ...parent, ...subSource }] as [
          any,
          Source,
        ])
      })
    } else {
      _.push([
        id,
        {
          title: source.title,
          ...parent,
        },
      ])
    }
  })

  return typeSafeObjectFromEntries(
    _.filter(([_, v]) => {
      if (v.disable === "cf" && process.env.CF_PAGES) {
        return false
      } else {
        return v.disable !== true
      }
    }),
  )
}
