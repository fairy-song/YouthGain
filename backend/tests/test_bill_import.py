"""Bill import: preview remains read-only; confirmation is account scoped."""
import io
import json
from datetime import datetime
from openpyxl import Workbook

from test_learning_flow import client, call  # reuse isolated in-memory app fixture


HEADER = 'date,type,amount,category,merchant,note,transaction_id,related_transaction_id,status,currency\n'


def upload(client, path, content, fields=None, user='alice', source='standard', filename='bill.csv'):
    data = {'file': (io.BytesIO(content), filename), 'source': source, **(fields or {})}
    return client.post(path, data=data, content_type='multipart/form-data',
                       headers={'Authorization': f'Bearer {user}'})


def prepare(client, content, source='standard', filename='bill.csv'):
    response = upload(client, '/api/decision/imports/preview', content, source=source, filename=filename)
    assert response.status_code == 200, response.json
    return response.json['data']


def commit(client, content, preview, ids=None, source='standard', filename='bill.csv', edits=None):
    return upload(client, '/api/decision/imports/confirm', content,
                  {'sha256': preview['sha256'], 'selected_ids': json.dumps(ids if ids is not None else
                   [r['row_id'] for r in preview['rows'] if r['decision'] == 'import']),
                   'categories': '{}', 'edits': json.dumps(edits or {})}, source=source, filename=filename)


def test_wechat_xlsx_preview_and_confirm(client):
    from app.services.checkin_service import BEIJING

    today = datetime.now(BEIJING).date()
    workbook = Workbook()
    sheet = workbook.active
    for row in range(1, 18):
        sheet.cell(row, 1, '微信支付账单说明' if row == 1 else '')
    sheet.append(['交易时间', '交易类型', '交易对方', '商品', '收/支', '金额(元)',
                  '支付方式', '当前状态', '交易单号', '商户单号', '备注'])
    sheet.append([today, '商户消费', '食堂', '午餐', '支出', 18.5, '零钱', '支付成功', 'WX-1', '', ''])
    sheet.append([today, '转账', '同学', '', '支出', 20, '零钱', '对方已收钱', 'WX-2', '', ''])
    sheet.append([today, '退款', '食堂', '', '收入', 5, '零钱', '已全额退款', 'WX-3', '', ''])
    sheet.append([today, '商户消费', '书店', '', '支出', '=10+2', '零钱', '支付成功', 'WX-4', '', ''])
    buffer = io.BytesIO()
    workbook.save(buffer)
    content = buffer.getvalue()
    result = prepare(client, content, source='wechat', filename='bill.xlsx')
    assert result['source'] == 'wechat'
    assert [row['row_id'] for row in result['rows']] == [19, 20, 21, 22]
    assert [row['decision'] for row in result['rows']] == ['import', 'import', 'review', 'review']
    assert result['rows'][0]['amount'] == '18.50'
    saved = commit(client, content, result, ids=[19], source='wechat', filename='bill.xlsx')
    assert saved.status_code == 201, saved.json
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert ledger['monthly_budget']['spent'] == 18.5
    assert len(ledger['transactions']) == 1
    assert prepare(client, content, source='wechat', filename='bill.xlsx')['rows'][0]['decision'] == 'duplicate'


def test_invalid_xlsx_is_rejected(client):
    response = upload(client, '/api/decision/imports/preview', b'not an xlsx',
                      source='wechat', filename='bill.xlsx')
    assert response.status_code == 400
    assert 'XLSX' in response.json['message']


def test_preview_confirm_overview_replay_and_account_isolation(client):
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date().isoformat()
    content = (HEADER + f'{today},expense,18.50,餐饮,食堂,午餐,T-1,,completed,CNY\n'
               f'{today},income,100.00,其他,家人,生活费,T-2,,completed,CNY\n'
               f'{today},transfer,30.00,其他,钱包,充值,T-3,,completed,CNY\n').encode('utf-8-sig')
    result = prepare(client, content)
    assert result['counts']['import'] == 3
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_budget']['spent'] == 0
    assert call(client, 'get', '/api/decision/transactions', user='bob').json['data']['transactions'] == []
    saved = commit(client, content, result)
    assert saved.status_code == 201, saved.json
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert len(ledger['transactions']) == 3
    assert ledger['monthly_budget']['spent'] == 18.5
    assert call(client, 'get', '/api/decision/transactions', user='bob').json['data']['monthly_budget']['spent'] == 0
    assert prepare(client, content)['counts']['duplicate'] == 3
    assert commit(client, content, result).json['data']['created'] is False
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_budget']['spent'] == 18.5
    assert call(client, 'delete', f"/api/decision/imports/{result['sha256']}").status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_budget']['spent'] == 0
    assert call(client, 'get', '/api/decision/transactions').json['data']['transactions'] == []


def test_overlap_refund_and_rejected_unlinked_refund(client):
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date().isoformat()
    purchase = (HEADER + f'{today},expense,25.00,餐饮,食堂,,P-1,,completed,CNY\n').encode()
    initial = prepare(client, purchase)
    assert commit(client, purchase, initial).status_code == 201
    second = (HEADER + f'{today},expense,25.00,餐饮,食堂,,P-1,,completed,CNY\n'
              f'{today},refund,5.00,,食堂,,R-1,P-1,completed,CNY\n'
              f'{today},refund,8.00,,未知,,R-2,missing,completed,CNY\n').encode()
    result = prepare(client, second)
    assert [r['decision'] for r in result['rows']] == ['duplicate', 'import', 'review']
    assert result['rows'][1]['category'] == '餐饮'
    assert commit(client, second, result).status_code == 201
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_budget']['spent'] == 20
    with client.application.app_context():
        from app.routes.decision_routes import _load_engine_inputs
        transactions, _goals, _skipped = _load_engine_inputs('alice')
        assert [round(txn.amount, 2) for txn in transactions] == [20.0]
    assert call(client, 'delete', f"/api/decision/imports/{initial['sha256']}").status_code == 400
    assert call(client, 'delete', f"/api/decision/imports/{result['sha256']}").status_code == 200
    assert call(client, 'delete', f"/api/decision/imports/{initial['sha256']}").status_code == 200


def test_invalid_status_and_wechat_unlinked_refund_stay_out_of_ledger(client):
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date().isoformat()
    content = (HEADER + f'{today},expense,20,餐饮,食堂,,A,,pending,CNY\n'
               f'{today},expense,15,餐饮,食堂,,B,,completed,USD\n').encode('gb18030')
    result = prepare(client, content)
    assert result['counts']['review'] == 2
    assert commit(client, content, result).status_code == 400
    wechat = ('微信支付账单明细列表\n'
              '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注\n'
              f'{today} 12:00:00,商户消费,食堂,午餐,支出,¥18.50,零钱,支付成功,W-1,,\n'
              f'{today} 13:00:00,退款,食堂,午餐,收入,¥2.00,零钱,退款成功,W-2,,\n').encode('gb18030')
    result = prepare(client, wechat, source='wechat')
    assert [r['decision'] for r in result['rows']] == ['import', 'review']
    assert commit(client, wechat, result, source='wechat').status_code == 201
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_budget']['spent'] == 18.5


def test_csv_quotes_and_bad_file_validation(client):
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date().isoformat()
    content = (HEADER + f'{today},expense,12.30,学习,"书店,校内",教材,Q-1,,completed,CNY\n').encode('utf-8-sig')
    assert prepare(client, content)['rows'][0]['merchant'] == '书店,校内'
    assert upload(client, '/api/decision/imports/preview', b'\x00\x01').status_code == 400
    assert upload(client, '/api/decision/imports/preview', b'not,csv\n').status_code == 400


def test_failed_batch_write_does_not_change_ledger_and_can_retry(client, monkeypatch):
    from app.services import learning_store
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date().isoformat()
    content = (HEADER + f'{today},expense,12.00,餐饮,食堂,,RETRY-1,,completed,CNY\n').encode()
    result = prepare(client, content)
    original = learning_store.write_entry
    monkeypatch.setattr(learning_store, 'write_entry', lambda *args, **kwargs: (_ for _ in ()).throw(OSError('disk unavailable')))
    assert commit(client, content, result).status_code == 503
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_budget']['spent'] == 0
    monkeypatch.setattr(learning_store, 'write_entry', original)
    assert commit(client, content, result).status_code == 201


def test_receipt_bill_refund_breakdown_edit_revert_and_batch_undo(client):
    from app.services.checkin_service import BEIJING

    today = datetime.now(BEIJING).date().isoformat()
    expense = (HEADER + f'{today},expense,100,购物,书店,,P-100,,completed,CNY\n').encode()
    initial = prepare(client, expense)
    assert commit(client, expense, initial).status_code == 201
    receipt_header = HEADER.rstrip() + ',receipt_kind\n'
    receipt = (receipt_header + f'{today},refund,20,,书店,,R-20,P-100,completed,CNY,\n'
               f'{today},income,30,,同学,,H-30,,completed,CNY,red_packet\n'
               f'{today},income,50,,家人,,T-50,,completed,CNY,external_transfer\n'
               f'{today},income,200,,本人钱包,,SELF,,completed,CNY,internal_transfer\n').encode()
    preview = prepare(client, receipt)
    assert commit(client, receipt, preview).status_code == 201
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert {key: value for key, value in ledger['monthly_cashflow'].items()
            if key not in ('category_breakdown', 'daily_spending')} == {
        'month': today[:7], 'spent': 80.0, 'gross_expense': 100.0, 'refunds': 20.0,
        'income': 80.0, 'remaining': 0.0,
        'income_breakdown': {'red_packet': 30.0, 'external_transfer': 50.0, 'other_income': 0.0},
        'has_expense_records': True, 'has_income_records': True, 'complete': True,
    }
    assert ledger['monthly_cashflow']['category_breakdown'] == [
        {'category': '购物', 'gross_expense': 100.0, 'refunds': 20.0, 'net': 80.0}]
    assert sum(day['spent'] for day in ledger['monthly_cashflow']['daily_spending']) == 80
    purchase = next(row for row in ledger['transactions'] if row.get('source_transaction_id') == 'P-100')
    assert (purchase['original_amount'], purchase['refunded_amount'], purchase['net_amount']) == ('100.00', '20.00', '80.00')
    assert prepare(client, receipt)['counts']['duplicate'] == 4
    assert commit(client, receipt, preview).json['data']['created'] is False

    detail = call(client, 'get', f"/api/decision/imports/{preview['sha256']}").json['data']
    income_row = next(row for row in detail['rows'] if row['source_transaction_id'] == 'H-30')
    assert call(client, 'put', f"/api/decision/imports/{preview['sha256']}/rows/{income_row['row_id']}",
                {'receipt_kind': 'internal_transfer'}).status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 50
    assert call(client, 'post', f"/api/decision/imports/{preview['sha256']}/revert-edit").status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 80
    assert call(client, 'get', f"/api/decision/imports/{preview['sha256']}", user='bob').status_code == 404
    assert call(client, 'delete', f"/api/decision/imports/{preview['sha256']}").status_code == 200
    restored = call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']
    assert (restored['spent'], restored['income'], restored['remaining']) == (100, 0, -100)


def test_wechat_receipt_classification_auto_order_link_and_manual_refund_link(client):
    from app.services.checkin_service import BEIJING

    today = datetime.now(BEIJING).date().isoformat()
    header = '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注\n'
    statement = (header + f'{today} 09:00:00,商户消费,书店,教材,支出,100,零钱,支付成功,W-P,ORDER-1,\n'
                 f'{today} 10:00:00,退款,书店,教材,收入,20,零钱,退款成功,W-R,ORDER-1,\n'
                 f'{today} 11:00:00,微信红包,同学,,收入,30,零钱,已存入零钱,W-H,,\n'
                 f'{today} 12:00:00,转账,家人,,收入,50,零钱,已收钱,W-T,,\n').encode('gb18030')
    preview = prepare(client, statement, source='wechat')
    assert [row['transaction_type'] for row in preview['rows']] == ['expense', 'refund', 'income', 'income']
    assert preview['rows'][1]['related_source_id'] == 'W-P'
    assert preview['rows'][1]['decision'] == 'import'
    assert [row['receipt_kind'] for row in preview['rows'][2:]] == ['red_packet', 'external_transfer']
    assert commit(client, statement, preview, source='wechat').status_code == 201
    cashflow = call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']
    assert (cashflow['spent'], cashflow['income'], cashflow['remaining']) == (80, 80, 0)

    unlinked = (header + f'{today} 13:00:00,退款,书店,教材,收入,5,零钱,退款成功,W-R2,,\n').encode('gb18030')
    review = prepare(client, unlinked, source='wechat')
    assert review['rows'][0]['decision'] == 'review'
    assert commit(client, unlinked, review, ids=[2], source='wechat', edits={'2': {'related_source_id': 'W-P'}}).status_code == 201
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['spent'] == 75


def test_same_file_can_add_reviewed_refund_after_first_partial_import(client):
    from app.services.checkin_service import BEIJING

    today = datetime.now(BEIJING).date().isoformat()
    header = '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注\n'
    statement = (header + f'{today} 09:00:00,商户消费,书店,教材,支出,100,零钱,支付成功,P,,\n'
                 f'{today} 10:00:00,退款,书店,教材,收入,20,零钱,退款成功,R,,\n'
                 f'{today} 11:00:00,微信红包,同学,,收入,30,零钱,已存入零钱,H,,\n').encode('gb18030')
    first = prepare(client, statement, source='wechat')
    assert commit(client, statement, first, ids=[2], source='wechat').status_code == 201
    second = prepare(client, statement, source='wechat')
    assert second['already_imported'] is True
    assert [row['decision'] for row in second['rows']] == ['duplicate', 'review', 'import']
    saved = commit(client, statement, second, ids=[3, 4], source='wechat',
                   edits={'3': {'related_source_id': 'P'}})
    assert saved.status_code == 201, saved.json
    assert saved.json['data']['count'] == 3
    cashflow = call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']
    assert (cashflow['spent'], cashflow['income'], cashflow['remaining']) == (80, 30, -50)
    assert commit(client, statement, first, ids=[2, 3, 4], source='wechat').json['data']['created'] is False
    assert len(call(client, 'get', '/api/decision/transactions').json['data']['transactions']) == 3


def test_cross_month_refund_is_linked_but_counted_on_arrival_month(client):
    from datetime import timedelta
    from app.services.checkin_service import BEIJING

    today = datetime.now(BEIJING).date()
    last_month = today.replace(day=1) - timedelta(days=1)
    purchase = (HEADER + f'{last_month},expense,100,购物,书店,,OLD-P,,completed,CNY\n').encode()
    first = prepare(client, purchase)
    assert commit(client, purchase, first).status_code == 201
    refund = (HEADER + f'{today},refund,20,,书店,,NEW-R,OLD-P,completed,CNY\n').encode()
    second = prepare(client, refund)
    assert commit(client, refund, second).status_code == 201
    data = call(client, 'get', '/api/decision/transactions').json['data']
    assert (data['monthly_cashflow']['spent'], data['monthly_cashflow']['income'],
            data['monthly_cashflow']['remaining']) == (-20, 0, 20)
    assert data['monthly_cashflow']['category_breakdown'] == [
        {'category': '购物', 'gross_expense': 0.0, 'refunds': 20.0, 'net': -20.0}]
    purchase_row = next(row for row in data['transactions'] if row.get('source_transaction_id') == 'OLD-P')
    assert purchase_row['net_amount'] == '80.00'


def test_unclear_receipt_needs_confirmation_and_invalid_relink_does_not_change_ledger(client):
    from app.services.checkin_service import BEIJING

    today = datetime.now(BEIJING).date().isoformat()
    header = '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注\n'
    unclear = (header + f'{today} 12:00:00,其他,未知,,收入,40,零钱,已到账,UNKNOWN,,\n').encode('gb18030')
    preview = prepare(client, unclear, source='wechat')
    assert preview['rows'][0]['decision'] == 'review'
    assert commit(client, unclear, preview, ids=[2], source='wechat').status_code == 400
    assert commit(client, unclear, preview, ids=[2], source='wechat',
                  edits={'2': {'receipt_kind': 'red_packet'}}).status_code == 201
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 40

    purchases = (HEADER + f'{today},expense,100,购物,书店,,P-100,,completed,CNY\n'
                 f'{today},expense,10,购物,文具店,,P-10,,completed,CNY\n'
                 f'{today},refund,20,,书店,,R-20,P-100,completed,CNY\n').encode()
    p = prepare(client, purchases)
    assert commit(client, purchases, p).status_code == 201
    refund_id = next(row['row_id'] for row in p['rows'] if row['transaction_type'] == 'refund')
    path = f"/api/decision/imports/{p['sha256']}/rows/{refund_id}"
    assert call(client, 'put', path, {'related_source_id': 'P-10'}).status_code == 400
    assert call(client, 'put', path, {'related_source_id': 'P-100'}, user='bob').status_code == 400
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['spent'] == 90
