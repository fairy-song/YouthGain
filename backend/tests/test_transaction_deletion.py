"""Delete only the selected account's bill; preserve refund and import invariants."""
from datetime import datetime
from test_bill_import import client, call, prepare, commit, HEADER


def today():
    from app.services.checkin_service import BEIJING
    return datetime.now(BEIJING).date().isoformat()


def test_manual_delete_is_account_scoped_and_updates_ledger(client):
    saved = call(client, 'post', '/api/decision/transactions',
                 {'amount': 80, 'category': '餐饮', 'date': today()}).json['data']
    path = '/api/decision/transactions/' + str(saved['id'])
    assert call(client, 'delete', path, user='bob').status_code == 404
    assert len(call(client, 'get', '/api/decision/transactions').json['data']['transactions']) == 1
    assert call(client, 'delete', path).status_code == 200
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert ledger['transactions'] == []
    assert call(client, 'delete', path).status_code == 404


def test_import_delete_one_row_and_undo(client):
    content = (HEADER + f'{today()},expense,30,餐饮,食堂,,P-1,,completed,CNY\n'
               + f'{today()},expense,50,学习,书店,,P-2,,completed,CNY\n').encode()
    p = prepare(client, content)
    assert commit(client, content, p).status_code == 201
    path = f"/api/decision/imports/{p['sha256']}/rows/{p['rows'][0]['row_id']}"
    assert call(client, 'delete', path, user='bob').status_code == 400
    assert call(client, 'delete', path).status_code == 200
    rows = call(client, 'get', '/api/decision/transactions').json['data']['transactions']
    assert [r['source_transaction_id'] for r in rows] == ['P-2']
    assert call(client, 'delete', path).status_code == 200  # idempotent
    assert call(client, 'post', f"/api/decision/imports/{p['sha256']}/revert-edit").status_code == 200
    assert len(call(client, 'get', '/api/decision/transactions').json['data']['transactions']) == 2


def test_refund_blocks_purchase_delete_and_stays_deleted_after_other_edit(client):
    content = (HEADER + f'{today()},expense,100,购物,商家,,P-1,,completed,CNY\n'
               + f'{today()},refund,20,购物,商家,,R-1,P-1,completed,CNY\n').encode()
    p = prepare(client, content)
    assert commit(client, content, p).status_code == 201
    expense, refund = p['rows']
    prefix = f"/api/decision/imports/{p['sha256']}/rows/"
    assert call(client, 'delete', prefix + str(expense['row_id'])).status_code == 400
    assert len(call(client, 'get', '/api/decision/transactions').json['data']['transactions']) == 2
    assert call(client, 'delete', prefix + str(refund['row_id'])).status_code == 200
    assert call(client, 'put', prefix + str(expense['row_id']), {'category': '数码'}).status_code == 200
    rows = call(client, 'get', '/api/decision/transactions').json['data']['transactions']
    assert len(rows) == 1 and rows[0]['transaction_type'] == 'expense'
    assert rows[0]['refunded_amount'] == '0'
    assert call(client, 'delete', prefix + str(expense['row_id'])).status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['transactions'] == []
