import React, { useEffect, useState } from 'react';
import { Collapse, Form, Table } from 'react-bootstrap';
import { accountingLabels, allowedAccountingTypes } from './CustomBillCategories';
import ImportPurchaseEditor, { purchaseValue } from './ImportPurchaseEditor';
import BillCategoryDropdown from './BillCategoryDropdown';
import './BillImportPreviewTable.css';

export const billExpenseCategories = ['未分类', '餐饮', '交通', '购物', '娱乐', '学习', '房租', '话费', '医疗', '其他'];
export const billReceiptLabels = { red_packet: '红包', external_transfer: '他人转入', other_income: '其他收入', internal_transfer: '本人账户转账' };
const typeLabels = { expense: '支出', refund: '退款', income: '收入', transfer: '转账', review: '待核对' };
const decisionLabels = { import: '可导入', duplicate: '重复', review: '需核对' };
const linkReasons = ['未找到唯一的原交易，请手动关联', '找不到可关联的原支出'];

export const canClassifyReceipt = row => row.transaction_type === 'income' && row.decision === 'review' && row.reason === '收款用途不明，请核对后入账';
export const canLinkRefund = row => row.transaction_type === 'refund' && row.decision === 'review' && linkReasons.includes(row.reason);

function CategorySelect({ row, change, expenseCategory, customOptions, disabled, onChange, onDelete }) {
  const original = row.original_transaction_type || row.transaction_type;
  const customId = change.category_id ?? ((change.receipt_kind || expenseCategory !== undefined) ? '' : row.category_id || '');
  let systemOptions;
  let systemValue;
  if (original === 'expense') {
    const category = expenseCategory ?? row.original_category ?? row.category ?? '未分类';
    systemOptions = [...new Set([row.original_category || (!row.category_id && row.category), ...billExpenseCategories])].filter(Boolean)
      .map(name => ({ value: `expense:${name}`, label: name, type: 'expense', category: name }));
    systemValue = `expense:${category}`;
  } else if (original === 'refund') {
    systemOptions = [{ value: 'refund', label: '退款', type: 'reset' }];
    systemValue = 'refund';
  } else if (original === 'income' || ['income', '收入', 'neutral'].includes(row.direction)) {
    systemOptions = Object.entries(billReceiptLabels).map(([key, label]) => ({ value: `receipt:${key}`, label, type: 'receipt', receiptKind: key }));
    const receipt = change.receipt_kind ?? row.original_receipt_kind ?? row.receipt_kind;
    systemValue = receipt ? `receipt:${receipt}` : canClassifyReceipt(row) ? '' : `receipt:${original === 'transfer' ? 'internal_transfer' : 'other_income'}`;
  } else {
    systemOptions = [{ value: 'transfer', label: '本人账户转账', type: 'reset' }];
    systemValue = 'transfer';
  }

  // 系统与自定义选项共用一个选择器；仍按原收支方向限制可选的账务类型。
  const types = allowedAccountingTypes(row);
  const listed = customOptions.filter(option => types.includes(option.accounting_type) && (option.active || option.id === customId));
  if (customId && !listed.some(option => option.id === customId)) listed.push({ id: customId, name: row.custom_category_name || row.category, accounting_type: row.transaction_type, active: false });
  const value = customId ? `custom:${customId}` : systemValue;
  return <BillCategoryDropdown label={`第 ${row.row_id} 行分类`} value={value} disabled={disabled} allowReset={canClassifyReceipt(row)}
    systemOptions={systemOptions.map(option => ({ ...option, selection: option }))}
    customOptions={listed.map(option => ({ id: option.id, name: option.name, value: `custom:${option.id}`,
      label: `${option.name} · ${accountingLabels[option.accounting_type]}${!option.active ? '（已停用）' : ''}`,
      disabled: !option.active, selection: { type: 'custom', id: option.id } }))}
    onChange={onChange} onDelete={onDelete} />;
}

function PreviewRow({ row, selected, disabled, change, expenseCategory, customOptions, kind, source, purchases, onToggle, onCategory, onPurchase, onAdded, onError, onBusyChange, onDeleteCategory }) {
  const [expanded, setExpanded] = useState(false);
  const eligible = row.decision === 'import' || canLinkRefund(row) || canClassifyReceipt(row);
  const link = change.related_source_id ?? row.related_source_id ?? '';
  const receiptKind = change.receipt_kind || row.receipt_kind || '';
  const isRefund = kind === 'refund';
  useEffect(() => { if (!isRefund) setExpanded(false); }, [isRefund]);
  const expandedId = `bill-preview-refund-${row.row_id}`;
  const result = kind === 'review' || (isRefund && !link && change.category_id) ? '保存为待核对，不参与统计'
    : (canLinkRefund(row) && link) || (canClassifyReceipt(row) && (receiptKind || change.category_id)) ? '已选择分类，确认时复核'
      : `${decisionLabels[row.decision]}${row.reason ? `：${row.reason}` : ''}`;
  return <tr className={isRefund && expanded ? 'bill-preview-row-expanded' : ''}>
    <td><Form.Check aria-label={`选择第 ${row.row_id} 行`} checked={selected} disabled={disabled || !eligible || (row.decision !== 'import' && !link && !receiptKind && !change.category_id)} onChange={onToggle} /></td>
    <td title={row.date}>{row.date || '—'}</td><td>{typeLabels[kind] || '待核对'}</td><td title={row.amount ? `¥${row.amount}` : undefined}>{row.amount ? `¥${row.amount}` : '—'}</td><td title={row.merchant}>{row.merchant || '—'}</td>
    <td className="bill-preview-category-cell">
      <CategorySelect row={row} change={change} expenseCategory={expenseCategory} customOptions={customOptions} disabled={disabled || !eligible} onChange={onCategory} onDelete={onDeleteCategory} />
      {isRefund && <>
        <button type="button" className="bill-refund-toggle" aria-label={`第 ${row.row_id} 行关联原支出`} aria-expanded={expanded} aria-controls={expandedId} disabled={disabled || !eligible} onClick={() => setExpanded(value => !value)}>关联原支出 <span aria-hidden="true" className={expanded ? 'is-expanded' : ''}>▶</span></button>
        {/* 关联数据保存在父组件；折叠只改变显示，不会清空已选交易或补录草稿。 */}
        <Collapse in={expanded} mountOnEnter>
          <div id={expandedId} className="bill-refund-details" aria-hidden={!expanded}>
            <div className="bill-refund-details-inner"><ImportPurchaseEditor label={`第 ${row.row_id} 行对应原支出`} source={source}
              value={purchaseValue({ source_transaction_id: link, source: change.related_source || row.related_source || source }, source)} purchases={purchases}
              disabled={disabled} onChange={onPurchase} onAdded={onAdded} onError={onError} onBusyChange={onBusyChange} /></div>
          </div>
        </Collapse>
      </>}
    </td>
    <td title={result}>{result}</td>
  </tr>;
}

/** 仅替换导入预览表格，文件区、统计、批量操作和确认导入仍由原弹窗管理。 */
export default function BillImportPreviewTable({ preview, selected, edits, overrides, customOptions, disabled, getKind, onToggle, onCategory, onPurchase, onAdded, onError, onBusyChange, onDeleteCategory }) {
  return <div className="table-responsive bill-preview-scroll"><Table size="sm" striped className="bill-preview-table" aria-label="账单导入预览">
    <thead><tr>{['选择', '日期', '类型', '金额', '对方', '分类', '处理结果'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
    <tbody>{preview.rows.map(row => <PreviewRow key={row.row_id} row={row} selected={selected.includes(row.row_id)} disabled={disabled}
      change={edits[row.row_id] || {}} expenseCategory={overrides[row.row_id]} customOptions={customOptions} kind={getKind(row, edits[row.row_id] || {})}
      source={preview.source} purchases={preview.purchase_options || []} onToggle={() => onToggle(row.row_id)} onCategory={option => onCategory(row, option)}
      onPurchase={(id, source) => onPurchase(row, id, source)} onAdded={onAdded} onError={onError} onBusyChange={onBusyChange} onDeleteCategory={onDeleteCategory} />)}</tbody>
  </Table></div>;
}
