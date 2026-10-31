from flask import Flask


def test_overview_counts_dynamic_publications_completed_records_and_only_expenses(monkeypatch):
    from app.services import admin_service as admin, knowledge_updates
    monkeypatch.setattr(admin, 'is_mysql_mode', lambda: False)
    monkeypatch.setattr(admin, 'is_dev_mode', lambda: True)
    monkeypatch.setattr(admin, '_dev_db', {'users': {'demo': {
        'profile': {}, 'assessments': {'one': {'completed': True}},
        'transactions': [{'amount': 100, 'category': '餐饮', 'transaction_type': 'expense'},
                         {'amount': 3000, 'category': '生活费', 'transaction_type': 'income'}]}},
        'public': {'knowledge_base': [{'id': 'manual'}]}})
    monkeypatch.setattr(knowledge_updates, 'published', lambda: [{'id': 'dynamic'}])
    with Flask(__name__).app_context():
        stats, error = admin.get_platform_stats()
        users, _ = admin.list_all_users()
    assert error is None
    assert stats['total_kb_articles'] == 2
    assert stats['assessment_completed_users'] == 1
    assert stats['category_breakdown'] == [{'category': '餐饮', 'total_amount': 100, 'count': 1}]
    assert users[0]['profile']['assessmentCompleted'] is True


def test_coach_config_can_be_read_without_legacy_provider_sdk(monkeypatch):
    from app.services import admin_service as admin, coach_service
    monkeypatch.setattr(coach_service, 'genai', None)
    monkeypatch.setattr(coach_service, 'is_dev_mode', lambda: True)
    monkeypatch.setattr(coach_service, '_dev_db', {'public': {}})
    with Flask(__name__).app_context():
        config, error = admin.get_coach_config()
    assert error is None
    assert config['system_prompt']
    assert config['is_default'] is True
