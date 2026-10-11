"""Public, link-only starter episodes checked on 2026-10-11.

Dates are conservative episode creation dates seen on the public platform. The
ordinary freshness and editorial-review deadlines still apply.
"""

FINANCE = ('每天5分钟理财小知识', '慢变量漂移',
           'https://www.xiaoyuzhoufm.com/podcast/6a0fc0877766d9e550f7beb7')
INVEST = ('每天5分钟投资小知识', '慢变量漂移',
          'https://www.xiaoyuzhoufm.com/podcast/6a0fc0694e1b6f98d52ce1c8')
BOOKS = ('拾光书房', '拾光研习社',
         'https://www.xiaoyuzhoufm.com/podcast/6a227d82bd11c9e37906dbeb')


def episode(show, title, url, summary, day, topics, difficulty=1, quality=0.8):
    name, publisher, canonical_url = show
    return {'name': name, 'publisher': publisher, 'canonical_url': canonical_url,
            'description': f'{name}的单集内容。', 'episode_title': title,
            'episode_url': url, 'episode_summary': summary,
            'episode_published_at': day, 'last_episode_at': day,
            'topics': topics, 'difficulty': difficulty, 'quality_score': quality}


EPISODES = (
    episode(FINANCE, '90天计划·第90天｜让家庭财务系统长期运转',
            'https://www.xiaoyuzhoufm.com/episode/6a96139bf03e74ee6b02e883',
            '用现金流、备用金、债务和目标四个要点，建立可定期复盘的财务安排。',
            '2026-09-01', ['budget', 'buffer']),
    episode(FINANCE, '90天计划·第72天｜提前安排年度大额开支',
            'https://www.xiaoyuzhoufm.com/episode/6a6cf202b581962ce2beb9b7',
            '把确定会来的大额支出提前放进预算，减少临时挤占生活费。',
            '2026-08-01', ['budget', 'buffer']),
    episode(FINANCE, '90天计划·第18天｜消费预算不压抑生活',
            'https://www.xiaoyuzhoufm.com/episode/6a25e3157444b5722234fc61',
            '区分必要、目标和弹性消费，给喜欢的事留合理空间。',
            '2026-06-08', ['budget', 'choice']),
    episode(FINANCE, '90天计划·第28天｜记账先找三类支出',
            'https://www.xiaoyuzhoufm.com/episode/6a32fe2243a22a69558591a8',
            '从支出结构识别容易忽略的消费，再给购物决定留一点时间。',
            '2026-06-18', ['budget', 'choice']),
    episode(INVEST, '90天计划·第90天｜把投资框架变成长期行动',
            'https://www.xiaoyuzhoufm.com/episode/6a961382a0210c197dcb4c79',
            '先核对目标、资金期限和生活缓冲，再考虑投资工具和风险。',
            '2026-09-01', ['buffer', 'risk'], difficulty=2),
    episode(INVEST, '90天计划·第89天｜目标、账户与纪律',
            'https://www.xiaoyuzhoufm.com/episode/6a94b9baa0210c197dcaaf6c',
            '把投资目标、账户边界和行动规则整理成容易检查的一页。',
            '2026-08-31', ['risk'], difficulty=2),
    episode(BOOKS, 'EP044｜为什么免费的东西，最容易让你花大钱？',
            'https://www.xiaoyuzhoufm.com/episode/6aa2c0af492687f6aad801d2',
            '用免邮、满减和免费试用的例子，理解消费决定如何被比较方式影响。',
            '2026-09-10', ['choice'], difficulty=2, quality=0.78),
    episode(BOOKS, 'EP043｜为什么你越想自己做选择，越像被算法安排？',
            'https://www.xiaoyuzhoufm.com/episode/6a9ff923f03e74ee6b072050',
            '从推荐和购物平台的日常场景，练习辨认自己的需要与外部影响。',
            '2026-09-08', ['choice'], difficulty=2, quality=0.78),
)
