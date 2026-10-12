"""Private reusable labels; their accounting meaning is fixed at creation."""
import uuid
from . import learning_store

TYPES = {'expense', 'income', 'refund', 'transfer', 'review'}
BUILTIN_NAMES = {'未分类', '餐饮', '交通', '购物', '娱乐', '学习', '房租', '话费', '医疗', '其他',
                 '红包', '他人转入', '其他收入', '本人账户转账'}


def list_options(uid):
    return [row for row in learning_store.read_entries(uid)
            if row.get('kind') == 'bill_category' and not row.get('deleted')]


def _name(value):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 50:
        raise ValueError('分类名称须为 1—50 个字符')
    return value.strip()


def save(uid, payload, option_id=None):
    if not isinstance(payload, dict):
        raise ValueError('分类内容无效')
    options = list_options(uid)
    previous = next((row for row in options if row['id'] == option_id), None) if option_id else None
    if option_id and previous is None:
        raise ValueError('自定义分类不存在')
    if set(payload) - ({'name', 'active'} if previous else {'name', 'accounting_type'}):
        raise ValueError('分类类型创建后不可更改，请新建另一分类')
    name = _name(payload.get('name', previous.get('name') if previous else None))
    if name in BUILTIN_NAMES:
        raise ValueError('已有同名系统分类，请直接使用系统选项')
    if any(row['id'] != option_id and row['name'].casefold() == name.casefold() for row in options):
        raise ValueError('已有同名自定义分类，请直接使用或恢复它')
    kind = previous['accounting_type'] if previous else payload.get('accounting_type')
    if kind not in TYPES:
        raise ValueError('请选择收入、支出、退款、本人划转或待核对')
    active = payload.get('active', previous.get('active', True) if previous else True)
    if type(active) is not bool:
        raise ValueError('分类启用状态无效')
    if not previous and len(options) >= 100:
        raise ValueError('最多保存 100 个自定义分类')
    return learning_store.write_entry(uid, option_id or f'bill-category:{uuid.uuid4().hex}',
                                      {'kind': 'bill_category', 'name': name,
                                       'accounting_type': kind, 'active': active})


def resolve(uid, option_id):
    row = learning_store.read_entry(uid, option_id) if isinstance(option_id, str) else None
    if not row or row.get('kind') != 'bill_category' or not row.get('active') or row.get('deleted'):
        raise ValueError('自定义分类不存在或已停用')
    return row


def remove(uid, option_id):
    """Remove a private label from use without rewriting historical bill snapshots."""
    previous = learning_store.read_entry(uid, option_id)
    if not previous or previous.get('kind') != 'bill_category':
        raise ValueError('自定义分类不存在')
    if previous.get('deleted'):
        return previous  # A repeated request must not affect other records.
    return learning_store.write_entry(uid, option_id, {**previous, 'active': False, 'deleted': True})
