// TOPIC_KEYWORDS 从 app.js 复制，用于兴趣匹配
const TOPIC_KEYWORDS = {
  科技: ['AI','人工智能','芯片','苹果','华为','特斯拉','SpaceX','大模型','GPT','ChatGPT','机器人','自动驾驶','手机','5G','6G','量子','航天','卫星','新能源','电池','小米','OPPO','vivo','荣耀','显卡','CPU','GPU','英特尔','AMD','英伟达','NVIDIA','微软','Google','Meta','字节','腾讯','阿里','百度','京东','拼多多','美团','无人机','星链','火箭','登陆','探测器','基因','生物','科技','技术','软件','硬件','系统','开源','编程','代码','算法'],
  游戏: ['游戏','原神','王者荣耀','英雄联盟','LOL','黑神话','崩坏','崩铁','星穹铁道','米哈游','网易','腾讯游戏','3A','Steam','Switch','PS5','Xbox','电竞','LPL','KPL','S赛','TI','DOTA','CS','瓦罗','绝地求生','吃鸡','永劫','魔兽','炉石','二次元','漫威','DC','赛博','主机','手游','端游','独立游戏','版号','氪金','抽卡'],
  娱乐: ['电影','综艺','明星','演唱会','票房','上映','电视剧','网剧','综艺节目','八卦','恋情','结婚','离婚','出轨','塌房','肖战','王一博','迪丽热巴','杨紫','赵丽颖','杨幂','耽改','选秀','偶像','女团','男团','C位','出道','流量','粉丝','热搜','绯闻','综艺','春晚','跨年','颁奖','红毯','杂志','封面','MV','新歌','专辑'],
  体育: ['NBA','足球','世界杯','奥运会','乒乓球','羽毛球','排球','游泳','田径','马拉松','滑雪','滑板','篮球','CBA','中超','英超','西甲','欧冠','德甲','意甲','法甲','梅西','C罗','詹姆斯','库里','詹姆斯','杜兰特','字母哥','约基奇','孙颖莎','马龙','樊振东','全红婵','谷爱凌','郑钦文','苏炳添'],
  财经: ['股市','A股','房价','GDP','人民币','基金','比特币','加密货币','区块链','经济','通胀','加息','降息','央行','理财','投资','保险','银行','贷款','利率','汇率','美股','港股','纳斯达克','道琼斯','恒生','上证','深证','创业板','科创板','牛市','熊市','分红','财报','利润','营收','市值','IPO','上市'],
  教育: ['考研','高考','大学','就业','学历','专业','留学','雅思','托福','GRE','公务员','国考','省考','教师','编制','博士','硕士','本科','专科','职校','培训','双减','学区','录取','分数','志愿','招生','毕业','实习','秋招','春招','社招'],
  社会: ['政策','民生','交通','补贴','医保','社保','养老','医疗','住房','公租房','公积金','环境','污染','天气','地震','台风','洪水','疫情','疫苗','安全','事故','火灾','犯罪','法律','法院','公安','消防','退伍','社保','退休','延迟退休','生育','二胎','三胎','人口','老龄化'],
  国际: ['美国','日本','韩国','俄罗斯','乌克兰','欧洲','中东','非洲','东南亚','印度','朝鲜','台湾','南海','贸易','制裁','关税','战争','冲突','谈判','协议','峰会','联合国','WTO','北约','G7','G20','金砖','一带一路','外交','大使','签证','移民','难民','人权']
};

function matchInterests(title, interests) {
  if (!interests || !interests.length) return false;
  for (const tag of interests) {
    const keywords = TOPIC_KEYWORDS[tag] || [];
    for (const kw of keywords) {
      if (title && title.includes(kw)) return true;
    }
  }
  return false;
}

function selectRecommendDigestItems(hotItems, interests) {
  const allowedPlatforms = new Set(['toutiao', 'baidu', 'weibo']);
  const filtered = (hotItems || []).filter(item => allowedPlatforms.has(item.platform));

  // 如果提供了兴趣标签，优先展示匹配的内容
  if (interests && interests.length > 0) {
    const matched = filtered.filter(item => matchInterests(item.title, interests));
    const unmatched = filtered.filter(item => !matchInterests(item.title, interests));
    return [...matched, ...unmatched].slice(0, 5);
  }

  return filtered.slice(0, 5);
}

function getDigestLabel(hour) {
  const h = hour !== undefined ? hour : new Date().getHours();
  if (h >= 6 && h < 11) return '☀️ 早间热榜';
  if (h >= 11 && h < 17) return '🌞 午间热榜';
  return '🌙 晚间热榜';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { selectRecommendDigestItems, getDigestLabel };
}
