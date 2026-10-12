"""Private labels and explicit refund references must not change accounting rules."""
from datetime import datetime
from test_learning_flow import client, call
from test_bill_import import HEADER, prepare, commit
from app.services.checkin_service import BEIJING


def option(client, name, kind):
    response = call(client, 'post', '/api/decision/bill-categories', {'name': name, 'accounting_type': kind})
    assert response.status_code == 201, response.json
    return response.json['data']['id']


def test_custom_income_is_private_reusable_and_rename_does_not_rewrite_history(client):
    today = datetime.now(BEIJING).date().isoformat()
    category = option(client, '奖学金', 'income')
    content = (HEADER + f'{today},income,100,未分类,学校,,SCH-1,,completed,CNY\n').encode()
    preview = prepare(client, content)
    assert commit(client, content, preview, edits={'2': {'category_id': category}}).status_code == 201
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert ledger['monthly_cashflow']['income'] == 100
    assert ledger['transactions'][0]['custom_category_name'] == '奖学金'
    assert call(client, 'get', '/api/decision/bill-categories', user='bob').json['data'] == []
    assert call(client, 'put', f'/api/decision/bill-categories/{category}', {'name': '校级奖学金'}).status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['transactions'][0]['custom_category_name'] == '奖学金'
    assert call(client, 'put', f'/api/decision/bill-categories/{category}', {'active': False}).status_code == 200
    second = (HEADER + f'{today},income,20,未分类,学校,,SCH-2,,completed,CNY\n').encode()
    p = prepare(client, second)
    assert commit(client, second, p, edits={'2': {'category_id': category}}).status_code == 400
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 100
    assert call(client, 'put', f'/api/decision/bill-categories/{category}', {'active': True}, user='bob').status_code == 400


def test_pending_refund_can_be_saved_then_linked_to_idempotent_backfilled_purchase(client):
    today = datetime.now(BEIJING).date().isoformat()
    category = option(client, '教材退款', 'refund')
    content = (HEADER + f'{today},refund,20,未分类,书店,,REF-1,,completed,CNY\n').encode()
    preview = prepare(client, content)
    assert commit(client, content, preview, ids=[2], edits={'2': {'category_id': category}}).status_code == 201
    assert call(client, 'get', '/api/decision/transactions').json['data']['transactions'] == []
    detail_path = f"/api/decision/imports/{preview['sha256']}"
    detail = call(client, 'get', detail_path).json['data']
    assert detail['rows'][0]['decision'] == 'review'
    original = {'source': 'standard', 'transaction_id': 'ORIGINAL-1', 'date': today,
                'amount': '100.00', 'category': '学习', 'merchant': '书店'}
    for _ in range(2):
        assert call(client, 'post', '/api/decision/imports/original-expenses', original).status_code == 200
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert len(ledger['transactions']) == 1
    assert ledger['monthly_cashflow']['spent'] == 100
    assert call(client, 'put', detail_path + '/rows/2', {'related_source_id': 'ORIGINAL-1'}).status_code == 200
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert ledger['monthly_cashflow']['spent'] == 80
    refund = next(row for row in ledger['transactions'] if row['transaction_type'] == 'refund')
    assert refund['category'] == '学习'
    assert refund['custom_category_name'] == '教材退款'
    original_batch = next(row for row in ledger['transactions'] if row['transaction_type'] == 'expense')['batch_id']
    assert call(client, 'delete', '/api/decision/imports/' + original_batch.split(':')[1]).status_code == 400
    assert call(client, 'post', detail_path + '/revert-edit').status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['spent'] == 100
    conflict = call(client, 'post', '/api/decision/imports/original-expenses', {**original, 'amount': '200'})
    assert conflict.status_code == 400


def test_custom_receipt_refund_can_link_manual_expense_and_cannot_exceed_or_delete_it(client):
    today = datetime.now(BEIJING).date().isoformat()
    manual = call(client, 'post', '/api/decision/transactions', {'date': today, 'amount': 100, 'category': '学习', 'merchant': '书店'}).json['data']['id']
    category = option(client, '书店退回', 'refund')
    content = (HEADER + f'{today},income,20,未分类,书店,,REF-M,,completed,CNY\n').encode()
    preview = prepare(client, content)
    assert any(row['source'] == 'manual' and row['source_transaction_id'] == str(manual) for row in preview['purchase_options'])
    changes = {'category_id': category, 'related_source': 'manual', 'related_source_id': str(manual)}
    assert commit(client, content, preview, edits={'2': changes}).status_code == 201
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert ledger['monthly_cashflow']['spent'] == 80
    assert ledger['monthly_cashflow']['income'] == 0
    assert next(row for row in ledger['transactions'] if row['source'] == 'manual')['net_amount'] == '80.00'
    assert call(client, 'delete', f'/api/decision/transactions/{manual}').status_code == 400
    second = (HEADER + f'{today},income,90,未分类,书店,,REF-TOO-MUCH,,completed,CNY\n').encode()
    p = prepare(client, second)
    assert commit(client, second, p, edits={'2': changes}).status_code == 400
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['spent'] == 80
    assert call(client, 'put', f"/api/decision/imports/{preview['sha256']}/rows/2", changes, user='bob').status_code == 400


def test_custom_review_excludes_income_and_duplicate_names_or_type_changes_are_rejected(client):
    today = datetime.now(BEIJING).date().isoformat()
    category = option(client, '待确认报销', 'review')
    assert call(client, 'post', '/api/decision/bill-categories', {'name': '待确认报销', 'accounting_type': 'income'}).status_code == 400
    assert call(client, 'put', f'/api/decision/bill-categories/{category}', {'accounting_type': 'income'}).status_code == 400
    content = (HEADER + f'{today},income,50,未分类,同学,,UNKNOWN,,completed,CNY\n').encode()
    p = prepare(client, content)
    assert commit(client, content, p, edits={'2': {'category_id': category}}).status_code == 201
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 0
    income = option(client, '活动报销', 'income')
    path = f"/api/decision/imports/{p['sha256']}/rows/2"
    assert call(client, 'put', path, {'category_id': income}).status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 50
    assert call(client, 'post', f"/api/decision/imports/{p['sha256']}/revert-edit").status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 0


def test_custom_option_does_not_make_failed_or_foreign_currency_rows_importable(client):
    today = datetime.now(BEIJING).date().isoformat()
    category = option(client, '其他来款', 'income')
    content = (HEADER + f'{today},income,50,未分类,同学,,PENDING,,pending,CNY\n'
               f'{today},income,50,未分类,同学,,USD,,completed,USD\n').encode()
    p = prepare(client, content)
    assert commit(client, content, p, ids=[2], edits={'2': {'category_id': category}}).status_code == 400
    assert commit(client, content, p, ids=[3], edits={'3': {'category_id': category}}).status_code == 400


def test_delete_category_is_private_requires_auth_and_cannot_delete_system_or_other_entries(client):
    from app.services import learning_store
    category = option(client, '兼职工资', 'income')
    path = f'/api/decision/bill-categories/{category}'
    assert client.delete(path).status_code == 401
    assert call(client, 'delete', path, user='bob').status_code == 400
    assert call(client, 'delete', '/api/decision/bill-categories/红包').status_code == 400
    learning_store.write_entry('alice', 'exercise:keep', {'kind': 'exercise', 'answer': '保留'})
    assert call(client, 'delete', '/api/decision/bill-categories/exercise:keep').status_code == 400
    assert learning_store.read_entry('alice', 'exercise:keep')['answer'] == '保留'
    assert call(client, 'get', '/api/decision/bill-categories').json['data'][0]['id'] == category
    assert call(client, 'delete', path).status_code == 200
    assert call(client, 'get', '/api/decision/bill-categories').json['data'] == []
    assert call(client, 'delete', path).status_code == 200
    assert call(client, 'put', path, {'active': True}).status_code == 400


def test_delete_removes_future_choices_but_preserves_history_and_allows_name_reuse(client):
    today = datetime.now(BEIJING).date().isoformat()
    category = option(client, '企业奖学金', 'income')
    content = (HEADER + f'{today},income,100,未分类,学校,,SCH-DELETE,,completed,CNY\n').encode()
    p = prepare(client, content)
    assert commit(client, content, p, edits={'2': {'category_id': category}}).status_code == 201
    before = call(client, 'get', '/api/decision/transactions').json['data']
    assert call(client, 'delete', f'/api/decision/bill-categories/{category}').status_code == 200
    after = call(client, 'get', '/api/decision/transactions').json['data']
    assert after['monthly_cashflow'] == before['monthly_cashflow']
    assert after['transactions'] == before['transactions']
    assert after['transactions'][0]['custom_category_name'] == '企业奖学金'
    second = (HEADER + f'{today},income,20,未分类,学校,,SCH-DELETED-REUSE,,completed,CNY\n').encode()
    p2 = prepare(client, second)
    assert commit(client, second, p2, edits={'2': {'category_id': category}}).status_code == 400
    replacement = option(client, '企业奖学金', 'income')
    assert replacement != category
    assert commit(client, second, p2, edits={'2': {'category_id': replacement}}).status_code == 201
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 120


def test_failed_delete_does_not_remove_the_category(client, monkeypatch):
    from app.services import learning_store
    category = option(client, '竞赛奖金', 'income')
    def fail_write():
        raise OSError('disk unavailable')
    monkeypatch.setattr(learning_store, 'persist_dev_db', fail_write)
    result = call(client, 'delete', f'/api/decision/bill-categories/{category}')
    assert result.status_code == 503
    rows = call(client, 'get', '/api/decision/bill-categories').json['data']
    assert rows[0]['id'] == category
    assert rows[0]['active'] is True
