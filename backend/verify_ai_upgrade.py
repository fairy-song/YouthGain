"""Actual provisioned-model smoke test with synthetic questions only."""
import argparse
import json
from pathlib import Path
import time

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / '.env.local')
from flask import Flask
from app.config import Config
from app.services.knowledge_retriever import retrieve_knowledge
from app.services.coach_tools import fact_catalog
from app.services.hstu_runtime import predict
from train_hstu import demo_data

ARTICLES = [
    {'id': 'budget', 'title': '预算约束', 'content': '预算是根据收入和支出的时间安排资金。优先预留必要生活开支，考虑到期还款与未来不定期开支，再分配可调整消费。不要把预计收入当作已到账余额。'},
    {'id': 'opportunity', 'title': '机会成本', 'content': '机会成本是选择一个方案时放弃的最佳替代方案的价值。衡量消费取舍时，比较其他用途和目标，金额并不等于心理感受。等价结余天数按正的历史估算月结余折算积累时间，不等于目标实际延迟。'},
    {'id': 'account', 'title': '心理账户', 'content': '心理账户描述人们会把钱分成不同用途类别，分别评价和使用。奖金与生活费即使同样是钱，也可能因标签不同产生不同花费倾向。这是理解行为的视角，不能据一次消费诊断个人偏差。'},
    {'id': 'risk', 'title': '风险与应急资金', 'content': '面对未来收入与必要开支的不确定性，预留应急资金可以保持流动性。投资有风险，不应承诺收益。应先理解产品条款和还款期限。'}]
QUERIES = [('饭钱和月底还款应该先留着吗', 'budget'), ('买电脑时放弃旅行算哪种代价', 'opportunity'),
           ('为什么拿到奖金比生活费更容易花掉', 'account'), ('兼职收入忽多忽少怎么办', 'risk')]


def verify(output, live=False):
    app = Flask(__name__)
    app.config.from_object(Config)
    report = {'questions_are_synthetic': True, 'retrieval_cases': []}
    with app.app_context():
        for query, expected in QUERIES:
            started = time.perf_counter()
            result = retrieve_knowledge(query, ARTICLES)
            report['retrieval_cases'].append({'query': query, 'expected': expected,
                'returned': [s['article_id'] for s in result['sources']],
                'hit_at_3': any(s['article_id'] == expected for s in result['sources']),
                'used': result['retrieval']['used'], 'degraded': result['retrieval']['degraded'],
                'milliseconds': round((time.perf_counter()-started)*1000, 2)})
        out_of_domain = retrieve_knowledge('火星天气预报', ARTICLES)
        report['out_of_domain_sources'] = [s['article_id'] for s in out_of_domain['sources']]
        report['hstu'] = predict(demo_data()[2][0]['payload'], Path(__file__).resolve().parents[1]/'models/hstu-demo/model.pt', allow_demo=True)
        if live:
            from app.services.zhipuai_service import ZhipuAIService
            from app.services.coach_validator import validate_reply
            query = '这是测试情境：月收入2000元，必要支出1200元。还能留多少钱，应注意什么？'
            result = retrieve_knowledge(query, ARTICLES)
            evidence = dict(result, facts=fact_catalog(message=query), financial_context_authorized=False, knowledge_status='available')
            service = ZhipuAIService()
            diagnostic = []
            if service.client:
                original = service.client.chat.completions.create
                def capture(*args, **kwargs):
                    value = original(*args, **kwargs)
                    raw = value.choices[0].message.content
                    _, checks = validate_reply(raw, evidence)
                    # This command exclusively uses the synthetic question above.
                    diagnostic.append({'synthetic_response': raw, 'checks': checks})
                    return value
                service.client.chat.completions.create = capture
            response = service.get_chat_response({'message': query, 'evidence': evidence})
            report['live_coach'] = response
            report['synthetic_generation_diagnostics'] = diagnostic
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'retrieval_hits': sum(r['hit_at_3'] for r in report['retrieval_cases']),
                      'retrieval_cases': len(QUERIES), 'retrieval_modes': list({r['used'] for r in report['retrieval_cases']}),
                      'ood_sources': report['out_of_domain_sources'],
                      'hstu_version': report['hstu']['model_version'],
                      'live_status': report.get('live_coach', {}).get('status'), 'report': str(output)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('output/ai-upgrade/model-smoke.json'))
    parser.add_argument('--live-coach', action='store_true', help='Explicitly allow a provider request with synthetic data.')
    args = parser.parse_args()
    verify(args.output, args.live_coach)
