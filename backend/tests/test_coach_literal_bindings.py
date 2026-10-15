import json
from app.services.coach_tools import fact_catalog
from app.services.coach_validator import validate_reply


def test_provider_copied_numbers_require_exact_field_value_and_declared_fact():
    facts = fact_catalog(message='月收入2000，必要支出1200')
    data = {'explanation': '月收入为2000元，必要支出为1200元，还能留800元。',
            'fact_ids': [f['id'] for f in facts], 'source_ids': [], 'claims': []}
    reply, checks = validate_reply(json.dumps(data, ensure_ascii=False), {'sources': [], 'facts': facts})
    assert '800.00元' in reply and '本轮给定情境' in reply
    assert len(checks['literal_scenario_bindings']) == 3
    data['explanation'] = '月收入为2000元，必要支出为1200元，还能留900元。'
    assert validate_reply(json.dumps(data, ensure_ascii=False), {'sources': [], 'facts': facts})[0] is None
    data['explanation'] = '月收入为2000元，必要支出为1200元，账户余额800元。'
    assert validate_reply(json.dumps(data, ensure_ascii=False), {'sources': [], 'facts': facts})[0] is None


def test_hypothetical_example_cannot_hide_an_unverified_personal_balance():
    reply, checks = validate_reply('你的余额9999元。假设每月存200元，3个月就是600元。', {'sources': [], 'facts': []})
    assert reply is None and 'unbound_financial_number' in checks['errors']


def test_program_renderer_removes_duplicate_units_and_corrects_scenario_scope():
    facts = fact_catalog(message='月收入2000，必要支出1200')
    raw = json.dumps({'explanation': '本月可支配金额为{{F:scenario_surplus}}元。',
                      'fact_ids': ['F:scenario_surplus'], 'source_ids': [], 'claims': []}, ensure_ascii=False)
    reply, checks = validate_reply(raw, {'sources': [], 'facts': facts})
    assert '800.00元' in reply and '元元' not in reply
    assert '给定收入减必要支出的差额' in reply and '其他未提供开支尚未扣除' in reply
    assert checks['interpretation_rewrites']
    raw = raw.replace('}}元', '}}天')
    reply, checks = validate_reply(raw, {'sources': [], 'facts': facts})
    assert reply is None and 'fact_unit_mismatch' in checks['errors']
