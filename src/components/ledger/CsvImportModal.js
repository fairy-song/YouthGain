import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import { confirmBillImport, editBillImportRow, getBillImport, listBillImports, previewBillImport, revertBillImportEdit, undoBillImport } from '../../services/api';
import { dateKey } from '../FinanceVisuals';

const typeLabel = { expense: '支出', refund: '退款', income: '收入', transfer: '转账' };
const receiptLabel = { red_packet: '红包', external_transfer: '他人转入', other_income: '其他收入', internal_transfer: '本人账户转账' };
const decisionLabel = { import: '可导入', duplicate: '重复', review: '需核对' };
const categories = ['未分类', '餐饮', '交通', '购物', '娱乐', '学习', '房租', '话费', '医疗', '其他'];
const errorText = error => error?.response?.data?.message || error?.message || '操作失败，请重试';

export default function CsvImportModal({ onClose, onSaved, entryMode = 'expense' }) {
  const [file, setFile] = useState(null);
  const [source, setSource] = useState('wechat');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [edits, setEdits] = useState({});
  const [batches, setBatches] = useState([]);
  const [activeBatch, setActiveBatch] = useState(null);
  const [rowDrafts, setRowDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refreshBatches = async () => setBatches(await listBillImports());
  useEffect(() => { refreshBatches().catch(() => {}); }, []);
  const clearPreview = () => { setPreview(null); setSelected([]); setOverrides({}); setEdits({}); setError(''); setMessage(''); };
  const runPreview = async () => {
    if (!file) { setError('请先选择 CSV 或 XLSX 文件'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await previewBillImport(file, source);
      setPreview(result);
      setSelected(result.rows.filter(row => row.decision === 'import').map(row => row.row_id));
      setOverrides({});
      setEdits({});
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true); setError('');
    try {
      const result = await confirmBillImport(file, source, preview.sha256, selected, overrides, edits);
      setMessage(result.created ? `账本已更新；这份文件当前共入账 ${result.count} 笔。` : '所选记录已导入，未重复记账。');
      setPreview(null); setSelected([]); setEdits({});
      await Promise.all([refreshBatches(), onSaved?.()]);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const undo = async digest => {
    setBusy(true); setError('');
    try {
      await undoBillImport(digest);
      setMessage('已撤销这批账单，概览和图表已更新。');
      setActiveBatch(null);
      await Promise.all([refreshBatches(), onSaved?.()]);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const openBatch = async digest => {
    setBusy(true); setError('');
    try { setActiveBatch(await getBillImport(digest)); setRowDrafts({}); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const saveRow = async row => {
    const change = rowDrafts[row.row_id];
    if (!change || Object.keys(change).length === 0) return;
    setBusy(true); setError('');
    try {
      setActiveBatch(await editBillImportRow(activeBatch.sha256, row.row_id, change));
      setRowDrafts({}); setMessage('已保存这笔修改，三项金额已更新。');
      await onSaved?.();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const revertEdit = async () => {
    setBusy(true); setError('');
    try {
      setActiveBatch(await revertBillImportEdit(activeBatch.sha256));
      setRowDrafts({}); setMessage('已撤销上次逐笔修改。');
      await onSaved?.();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const toggle = id => setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const selectedTotals = preview?.rows.filter(row => selected.includes(row.row_id) && row.date?.slice(0, 7) === dateKey().slice(0, 7)).reduce((sum, row) => {
    const cents = Math.round(Number(row.amount) * 100);
    const receiptKind = edits[row.row_id]?.receipt_kind || row.receipt_kind;
    const kind = receiptKind === 'internal_transfer' ? 'transfer' : row.transaction_type === 'transfer' && receiptKind ? 'income' : row.transaction_type;
    if (kind === 'expense') sum.spent += cents;
    if (kind === 'refund') sum.spent -= cents;
    if (kind === 'income') sum.income += cents;
    return sum;
  }, { spent: 0, income: 0 }) || { spent: 0, income: 0 };
  const purchaseChoices = [...new Map((preview?.purchase_options || []).map(row => [row.source_transaction_id, row])).values()];
  const importedPurchases = [...new Map((activeBatch?.purchase_options || []).map(row => [row.source_transaction_id, row])).values()];
  const setPreviewEdit = (rowId, key, value) => {
    setEdits(current => ({ ...current, [rowId]: { ...current[rowId], [key]: value } }));
    if (['related_source_id', 'receipt_kind'].includes(key) && value) setSelected(current => current.includes(rowId) ? current : [...current, rowId]);
    if (['related_source_id', 'receipt_kind'].includes(key) && !value) setSelected(current => current.filter(id => id !== rowId));
  };
  const setRowDraft = (rowId, key, value) => setRowDrafts(current => ({ ...current, [rowId]: { ...current[rowId], [key]: value } }));
  return <Modal show size="xl" centered onHide={() => { if (!busy) onClose(); }} backdrop={busy ? 'static' : true} aria-labelledby="csv-import-title">
    <Modal.Header closeButton={!busy}><Modal.Title id="csv-import-title">{entryMode === 'receipt' ? '导入收款账单' : '导入支出账单'}</Modal.Title></Modal.Header>
    <Modal.Body>
      <p className="text-muted small">先预览，再确认入账。含收支两方向的完整流水只需上传一次，系统会逐行分类；退款抵减原支出，不计为收入。未关联退款可在预览中选择原支出。原始文件不会保存在青盈。</p>
      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      {message && <Alert variant="success" role="status">{message}</Alert>}
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <Form.Group controlId="csv-source"><Form.Label>账单来源</Form.Label><Form.Select value={source} disabled={busy} onChange={e => { setSource(e.target.value); clearPreview(); }}><option value="wechat">微信支付 CSV / XLSX</option><option value="standard">青盈标准 CSV</option><option value="auto">自动识别</option></Form.Select></Form.Group>
        <Form.Group controlId="csv-file"><Form.Label>文件（CSV / XLSX，最多 2 MB、1500 行）</Form.Label><Form.Control type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); clearPreview(); }} /></Form.Group>
        <Button variant="outline-success" disabled={busy || !file} onClick={runPreview}>{busy ? '处理中…' : '预览账单'}</Button>
        <a href="/templates/qingying-bill-template.csv" download className="small mb-2">下载标准模板</a>
      </div>
      {source === 'standard' && <p className="small text-muted">标准 CSV 每行填写 date、type、amount、transaction_id；退款填写 related_transaction_id。收款可加 receipt_kind（red_packet / external_transfer / other_income / internal_transfer）。status 填 completed。</p>}
      {preview && <>
        <p className="small">可导入 {preview.counts.import} 行（支出 {preview.by_type?.expense || 0}、退款 {preview.by_type?.refund || 0}、收入 {preview.by_type?.income || 0}、转账 {preview.by_type?.transfer || 0}） · 重复 {preview.counts.duplicate} 行 · 需核对 {preview.counts.review} 行。已完成且可确认的行默认选中。</p>
        <p className="small fw-semibold">已选 {selected.length} 行 · 预计本月支出变化 ¥{(selectedTotals.spent / 100).toFixed(2)} · 收入变化 ¥{(selectedTotals.income / 100).toFixed(2)} · 剩余变化 ¥{((selectedTotals.income - selectedTotals.spent) / 100).toFixed(2)}</p>
        {preview.already_imported && <Alert variant="info">这份文件已有部分记录入账；已入账行会跳过，仍可核对并追加其他行。</Alert>}
        <div className="table-responsive" style={{ maxHeight: '45vh' }}><Table size="sm" striped><thead><tr><th>选择</th><th>日期</th><th>类型</th><th>金额</th><th>对方</th><th>分类或关联原支出</th><th>处理结果</th></tr></thead><tbody>{preview.rows.map(row => {
          const canLink = row.transaction_type === 'refund' && row.decision === 'review' && ['未找到唯一的原交易，请手动关联', '找不到可关联的原支出'].includes(row.reason);
          const canClassify = row.transaction_type === 'income' && row.decision === 'review' && row.reason === '收款用途不明，请核对后入账';
          const link = edits[row.row_id]?.related_source_id || row.related_source_id || '';
          const receiptKind = edits[row.row_id]?.receipt_kind || row.receipt_kind || '';
          return <tr key={row.row_id}>
            <td><Form.Check aria-label={`选择第 ${row.row_id} 行`} checked={selected.includes(row.row_id)} disabled={busy || (row.decision !== 'import' && !(canLink && link) && !(canClassify && receiptKind))} onChange={() => toggle(row.row_id)} /></td>
            <td>{row.date || '—'}</td><td>{typeLabel[row.transaction_type] || '待核对'}</td><td>{row.amount ? `¥${row.amount}` : '—'}</td><td>{row.merchant || '—'}</td>
            <td>{row.transaction_type === 'expense' && row.decision === 'import' ? <Form.Select size="sm" aria-label={`第 ${row.row_id} 行类别`} value={overrides[row.row_id] || row.category} onChange={e => setOverrides(current => ({ ...current, [row.row_id]: e.target.value }))}>{[...new Set([row.category, ...categories])].map(value => <option key={value}>{value}</option>)}</Form.Select>
              : row.transaction_type === 'refund' && (row.decision === 'import' || canLink) ? <Form.Select size="sm" aria-label={`第 ${row.row_id} 行对应原支出`} value={link} onChange={e => setPreviewEdit(row.row_id, 'related_source_id', e.target.value)}><option value="">选择原支出</option>{purchaseChoices.map(purchase => <option key={purchase.source_transaction_id} value={purchase.source_transaction_id}>{purchase.date} · {purchase.merchant || purchase.category} · ¥{purchase.amount} · {purchase.source_transaction_id}</option>)}</Form.Select>
                : ['income', 'transfer'].includes(row.transaction_type) && (row.decision === 'import' || canClassify) && (row.transaction_type === 'income' || ['income', '收入', 'neutral'].includes(row.direction)) ? <Form.Select size="sm" aria-label={`第 ${row.row_id} 行收款类型`} value={receiptKind || (canClassify ? '' : 'internal_transfer')} onChange={e => setPreviewEdit(row.row_id, 'receipt_kind', e.target.value)}>{canClassify && <option value="">选择收款类型</option>}{Object.entries(receiptLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Form.Select> : row.category || '—'}</td>
            <td>{(canLink && link) || (canClassify && receiptKind) ? '已选择分类，确认时复核' : `${decisionLabel[row.decision]}${row.reason ? `：${row.reason}` : ''}`}</td>
          </tr>;
        })}</tbody></Table></div>
        <Button variant="success" disabled={busy || selected.length === 0} onClick={commit}>确认导入 {selected.length} 行</Button>
      </>}
      {batches.some(batch => batch.status === 'committed') && <div className="mt-4"><h6>已导入批次</h6>{batches.filter(batch => batch.status === 'committed').map(batch => <div className="d-flex gap-2 align-items-center mb-2" key={batch.sha256}><span className="small">{batch.created_at?.slice(0, 16)} · {batch.source === 'wechat' ? '微信支付' : '青盈标准账单'} · {batch.count} 行</span><Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => openBatch(batch.sha256)}>查看并修改</Button><Button size="sm" variant="outline-danger" disabled={busy} onClick={() => undo(batch.sha256)}>撤销整批</Button></div>)}</div>}
      {activeBatch?.status === 'committed' && <div className="mt-3 border rounded p-3">
        <div className="d-flex flex-wrap gap-2 align-items-center mb-2"><h6 className="mb-0">逐笔修改</h6><Button size="sm" variant="outline-secondary" disabled={busy || !activeBatch.can_revert_edit} onClick={revertEdit}>撤销上次修改</Button></div>
        <p className="small text-muted">可改支出类别、收款类型和退款关联；每次保存后可撤销上次修改，整批也可撤销。金额或日期有误时，撤销整批后重新导入。</p>
        <div className="table-responsive" style={{ maxHeight: '30vh' }}><Table size="sm"><thead><tr><th>日期</th><th>类型</th><th>金额</th><th>当前分类</th><th>修改</th></tr></thead><tbody>{activeBatch.rows.map(row => {
          const editable = row.transaction_type !== 'transfer' || ['income', '收入', 'neutral'].includes(row.direction);
          return <tr key={row.row_id}>
            <td>{row.date}</td><td>{typeLabel[row.transaction_type]}</td><td>¥{row.amount}</td>
            <td>{row.transaction_type === 'refund' ? `关联 ${row.related_source_id}` : receiptLabel[row.receipt_kind] || row.category}</td>
            <td className="d-flex gap-2">{row.transaction_type === 'expense' ? <Form.Select size="sm" aria-label={`修改第 ${row.row_id} 行类别`} value={rowDrafts[row.row_id]?.category || row.category} onChange={e => setRowDraft(row.row_id, 'category', e.target.value)}>{[...new Set([row.category, ...categories])].map(value => <option key={value}>{value}</option>)}</Form.Select>
              : row.transaction_type === 'refund' ? <Form.Select size="sm" aria-label={`修改第 ${row.row_id} 行退款关联`} value={rowDrafts[row.row_id]?.related_source_id || row.related_source_id} onChange={e => setRowDraft(row.row_id, 'related_source_id', e.target.value)}>{importedPurchases.map(purchase => <option key={purchase.source_transaction_id} value={purchase.source_transaction_id}>{purchase.date} · {purchase.merchant || purchase.category} · ¥{purchase.amount} · {purchase.source_transaction_id}</option>)}</Form.Select>
                : editable ? <Form.Select size="sm" aria-label={`修改第 ${row.row_id} 行收款类型`} value={rowDrafts[row.row_id]?.receipt_kind || row.receipt_kind || 'internal_transfer'} onChange={e => setRowDraft(row.row_id, 'receipt_kind', e.target.value)}>{Object.entries(receiptLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Form.Select> : <span className="small text-muted">已识别为本人转账</span>}
              {editable && <Button size="sm" variant="outline-success" disabled={busy || !rowDrafts[row.row_id]} onClick={() => saveRow(row)}>保存</Button>}
            </td>
          </tr>;
        })}</tbody></Table></div>
      </div>}
    </Modal.Body>
    <Modal.Footer><Button variant="outline-secondary" disabled={busy} onClick={onClose}>完成</Button></Modal.Footer>
  </Modal>;
}
