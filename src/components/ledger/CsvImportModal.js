import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Table } from 'react-bootstrap';
import { confirmBillImport, deleteBillCategory, editBillImportRow, getBillImport, listBillImports, listBillCategories, previewBillImport, revertBillImportEdit, undoBillImport } from '../../services/api';
import { dateKey } from '../FinanceVisuals';
import ImportPurchaseEditor, { purchaseValue } from './ImportPurchaseEditor';
import BillImportPreviewTable from './BillImportPreviewTable';
import CustomBillCategorySelect, { BillCategoryCreateModal, BillCategoryManager, accountingLabels, allowedAccountingTypes } from './CustomBillCategories';

const typeLabel = { expense: '支出', refund: '退款', income: '收入', transfer: '转账', review: '待核对' };
const receiptLabel = { red_packet: '红包', external_transfer: '他人转入', other_income: '其他收入', internal_transfer: '本人账户转账' };
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
  const [customOptions, setCustomOptions] = useState([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [showCategoryCreate, setShowCategoryCreate] = useState(false);
  const [showBulkApply, setShowBulkApply] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [operationBusy, setBusy] = useState(false);
  const [childBusy, setChildBusy] = useState(false);
  const busy = operationBusy || childBusy;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refreshBatches = async () => setBatches(await listBillImports());
  useEffect(() => { refreshBatches().catch(() => {}); }, []);
  useEffect(() => { let active = true; listBillCategories().then(rows => { if (active) setCustomOptions(rows); }).catch(e => { if (active) setError(errorText(e)); }); return () => { active = false; }; }, []);
  const upsertOption = option => setCustomOptions(current => [option, ...current.filter(row => row.id !== option.id)]);
  const categoryCreated = async option => {
    // 所有下拉框共用一个列表：先加入保存结果，再重新读取服务端分类。
    upsertOption(option);
    setBulkCategory(option.id);
    try {
      const rows = await listBillCategories();
      setCustomOptions([option, ...rows.filter(row => row.id !== option.id)]);
      setError('');
    } catch (e) {
      // 分类已经保存成功；刷新失败时保留它，避免用户重复创建。
      setError(`分类已新增，其他分类暂未刷新：${errorText(e)}`);
    }
    setMessage(`已新增“${option.name}”，可逐行选择或应用到已选记录。`);
  };
  const categoryDeleted = async id => {
    setBusy(true);
    try {
      await deleteBillCategory(id);
      setCustomOptions(current => current.filter(option => option.id !== id));
      setBulkCategory(current => current === id ? '' : current);
      const clearReferences = (current, rows) => Object.fromEntries(Object.entries(current).flatMap(([rowId, change]) => {
        if (change.category_id !== id) return [[rowId, change]];
        const next = { ...change };
        delete next.category_id;
        const row = rows?.find(item => String(item.row_id) === rowId);
        if ((row?.original_transaction_type || row?.transaction_type) !== 'refund') { delete next.related_source_id; delete next.related_source; }
        return Object.keys(next).length ? [[rowId, next]] : [];
      }));
      // 只清理尚未提交的分类引用；历史已入账记录继续保留原快照。
      setEdits(current => clearReferences(current, preview?.rows));
      setRowDrafts(current => clearReferences(current, activeBatch?.rows));
      setSelected(current => current.filter(rowId => {
        const row = preview?.rows.find(item => item.row_id === rowId);
        if (edits[rowId]?.category_id !== id) return true;
        const removedType = customOptions.find(option => option.id === id)?.accounting_type;
        if (removedType && removedType !== (row?.original_transaction_type || row?.transaction_type)) return false;
        if (row?.decision !== 'review') return true;
        return row.transaction_type === 'refund' && !!(edits[rowId]?.related_source_id ?? row.related_source_id);
      }));
      try {
        const rows = await listBillCategories();
        setCustomOptions(rows.filter(option => option.id !== id));
        setError('');
      } catch (e) { setError(`分类已删除，其他分类暂未刷新：${errorText(e)}`); }
      setMessage('自定义分类已删除，预览和分类管理已更新。使用它的预览行已恢复系统分类，请核对后导入；已入账记录保持不变。');
    } finally { setBusy(false); }
  };
  const effectiveKind = (row, change = {}) => {
    if (change.category_id) return customOptions.find(option => option.id === change.category_id)?.accounting_type || row.transaction_type;
    if (change.receipt_kind) return change.receipt_kind === 'internal_transfer' ? 'transfer' : 'income';
    if (change.category_id === '' && row.original_transaction_type) return row.original_transaction_type;
    return row.transaction_type;
  };
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
      setMessage(result.created ? `账本已更新；这份文件当前共保存 ${result.count} 笔。待核对记录不参与收支统计。` : '所选记录已导入，未重复记账。');
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
    const change = edits[row.row_id] || {};
    const kind = effectiveKind(row, change);
    if (kind === 'expense') sum.spent += cents;
    if (kind === 'refund' && (change.related_source_id ?? row.related_source_id)) sum.spent -= cents;
    if (kind === 'income') sum.income += cents;
    return sum;
  }, { spent: 0, income: 0 }) || { spent: 0, income: 0 };

  const importedPurchases = activeBatch?.purchase_options || [];
  const setPreviewEdit = (rowId, key, value) => {
    setEdits(current => ({ ...current, [rowId]: { ...current[rowId], [key]: value, ...(key === 'receipt_kind' && current[rowId]?.category_id ? { category_id: '' } : {}) } }));
    if (['related_source_id', 'receipt_kind', 'category_id'].includes(key) && value) setSelected(current => current.includes(rowId) ? current : [...current, rowId]);
    if (['related_source_id', 'receipt_kind'].includes(key) && !value) setSelected(current => current.filter(id => id !== rowId));
  };
  const setRowDraft = (rowId, key, value) => setRowDrafts(current => ({ ...current, [rowId]: { ...current[rowId], [key]: value, ...(['receipt_kind', 'category'].includes(key) && (current[rowId]?.category_id || activeBatch?.rows.find(row => row.row_id === rowId)?.category_id) ? { category_id: '' } : {}) } }));
  const chooseCustom = (rowId, value, imported = false) => {
    const setter = imported ? setRowDrafts : setEdits;
    const row = (imported ? activeBatch?.rows : preview?.rows)?.find(item => item.row_id === rowId);
    const nextKind = value ? customOptions.find(option => option.id === value)?.accounting_type : row?.original_transaction_type || row?.transaction_type;
    setter(current => {
      const next = { ...current[rowId] };
      if (value || imported) next.category_id = value; else delete next.category_id;
      delete next.receipt_kind; delete next.category;
      // 从退款切换回收入等类型时，移除本次编辑的关联，避免提交不兼容的退款字段。
      if (nextKind !== 'refund') { delete next.related_source_id; delete next.related_source; }
      const updated = { ...current };
      if (Object.keys(next).length) updated[rowId] = next; else delete updated[rowId];
      return updated;
    });
    if (!imported && value) setSelected(current => current.includes(rowId) ? current : [...current, rowId]);
  };
  const choosePreviewCategory = (row, option) => {
    if (option.type === 'custom') { chooseCustom(row.row_id, option.id); return; }
    // 单一下拉框分别映射到原有类别/收款类型字段，保持导入接口和退款核算不变。
    chooseCustom(row.row_id, '');
    if (option.type === 'expense') setOverrides(current => ({ ...current, [row.row_id]: option.category }));
    if (option.type === 'receipt') setPreviewEdit(row.row_id, 'receipt_kind', option.receiptKind);
    else if (row.decision === 'review' && !(edits[row.row_id]?.related_source_id ?? row.related_source_id)) {
      setSelected(current => current.filter(id => id !== row.row_id));
    }
  };
  const choosePurchase = (row, id, relatedSource, imported = false) => {
    const setter = imported ? setRowDrafts : setEdits;
    setter(current => ({ ...current, [row.row_id]: { ...current[row.row_id], related_source_id: id,
      ...((relatedSource !== (imported ? activeBatch.source : preview.source) || row.related_source || current[row.row_id]?.related_source) ? { related_source: relatedSource } : {}) } }));
    if (!imported && id) setSelected(current => current.includes(row.row_id) ? current : [...current, row.row_id]);
    if (!imported && !id && row.decision === 'review' && !edits[row.row_id]?.category_id) setSelected(current => current.filter(id => id !== row.row_id));
  };
  const addedPurchase = async (purchase, imported = false) => {
    const setter = imported ? setActiveBatch : setPreview;
    setter(current => ({ ...current, purchase_options: [...(current.purchase_options || []), purchase] }));
    await Promise.all([refreshBatches(), onSaved?.()]);
    setMessage('原支出已补录。若取消退款导入，原支出仍保留，可在批次中撤销。');
  };
  const bulkRows = preview?.rows.filter(row => selected.includes(row.row_id)) || [];
  const bulkOptions = customOptions.filter(option => option.active && bulkRows.every(row => allowedAccountingTypes(row).includes(option.accounting_type)));
  const openBulkApply = () => {
    setBulkError('');
    if (!bulkOptions.some(option => option.id === bulkCategory)) setBulkCategory('');
    setShowBulkApply(true);
  };
  const bulkApply = () => {
    const option = customOptions.find(row => row.id === bulkCategory);
    if (!option?.active || !bulkRows.length) { setBulkError('请选择分类和需要应用的记录。'); return; }
    // 批量修改仍遵守原有收支类型限制，不把支出误归为收入。
    if (bulkRows.some(row => !allowedAccountingTypes(row).includes(option.accounting_type))) { setBulkError('所选记录的收支方向不同，请分组后批量分类。'); return; }
    bulkRows.forEach(row => chooseCustom(row.row_id, option.id));
    setShowBulkApply(false);
    setMessage(`已将“${option.name}”应用到 ${bulkRows.length} 行，确认导入后入账。`);
  };
  return <><Modal show size="xl" centered onHide={() => { if (!busy && !showCategoryCreate && !showBulkApply) onClose(); }} backdrop={busy ? 'static' : true} aria-labelledby="csv-import-title">
    <Modal.Header closeButton={!busy}><Modal.Title id="csv-import-title">{entryMode === 'receipt' ? '导入收款账单' : '导入支出账单'}</Modal.Title></Modal.Header>
    <Modal.Body>
      <p className="text-muted small">先预览，再确认入账。含收支两方向的完整流水只需上传一次，系统会逐行分类；退款抵减原支出，不计为收入。未关联退款可在预览中选择原支出。原始文件不会保存在青盈。</p>
      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      {message && <Alert variant="success" role="status">{message}</Alert>}
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <Form.Group controlId="csv-source"><Form.Label>账单来源</Form.Label><Form.Select value={source} disabled={busy} onChange={e => { setSource(e.target.value); clearPreview(); }}><option value="wechat">微信支付</option><option value="standard">青盈标准 CSV</option><option value="auto">自动识别</option></Form.Select></Form.Group>
        <Form.Group controlId="csv-file"><Form.Label>文件（CSV / XLSX，最多 2 MB、1500 行）</Form.Label><Form.Control type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); clearPreview(); }} /></Form.Group>
        <Button variant="outline-success" disabled={busy || !file} onClick={runPreview}>{busy ? '处理中…' : '预览账单'}</Button>
        <a href="/templates/qingying-bill-template.csv" download className="small mb-2">下载标准模板</a>
      </div>
      {source === 'standard' && <p className="small text-muted">标准 CSV 每行填写 date、type、amount、transaction_id；退款填写 related_transaction_id。收款可加 receipt_kind（red_packet / external_transfer / other_income / internal_transfer）。status 填 completed。</p>}
      {preview && <>
        <p className="small">可导入 {preview.counts.import} 行（支出 {preview.by_type?.expense || 0}、退款 {preview.by_type?.refund || 0}、收入 {preview.by_type?.income || 0}、转账 {preview.by_type?.transfer || 0}） · 重复 {preview.counts.duplicate} 行 · 需核对 {preview.counts.review} 行。已完成且可确认的行默认选中。</p>
        <p className="small fw-semibold">已选 {selected.length} 行 · 预计本月支出变化 ¥{(selectedTotals.spent / 100).toFixed(2)} · 收入变化 ¥{(selectedTotals.income / 100).toFixed(2)} · 剩余变化 ¥{((selectedTotals.income - selectedTotals.spent) / 100).toFixed(2)}</p>
        {/* 顶部只保留两个操作按钮，逐行的分类选择框继续保留。 */}
        <div className="d-flex flex-wrap gap-2 mb-2"><Button size="sm" variant="outline-secondary" disabled={busy || !selected.length} onClick={openBulkApply}>应用到已选记录</Button><Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setShowCategoryCreate(true)}>自定义分类</Button></div>
        {preview.already_imported && <Alert variant="info">这份文件已有部分记录入账；已入账行会跳过，仍可核对并追加其他行。</Alert>}
        <BillImportPreviewTable preview={preview} selected={selected} edits={edits} overrides={overrides} customOptions={customOptions}
          disabled={busy} getKind={effectiveKind} onToggle={toggle} onCategory={choosePreviewCategory} onPurchase={choosePurchase}
          onAdded={purchase => addedPurchase(purchase)} onError={setError} onBusyChange={setChildBusy} onDeleteCategory={categoryDeleted} />
        <Button variant="success" disabled={busy || selected.length === 0} onClick={commit}>确认导入 {selected.length} 行</Button>
      </>}
      {batches.some(batch => batch.status === 'committed') && <div className="mt-4"><h6>已导入批次</h6>{batches.filter(batch => batch.status === 'committed').map(batch => <div className="d-flex gap-2 align-items-center mb-2" key={batch.sha256}><span className="small">{batch.created_at?.slice(0, 16)} · {batch.source === 'wechat' ? '微信支付' : '青盈标准账单'} · {batch.count} 行</span><Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => openBatch(batch.sha256)}>查看并修改</Button><Button size="sm" variant="outline-danger" disabled={busy} onClick={() => undo(batch.sha256)}>撤销整批</Button></div>)}</div>}
      {activeBatch?.status === 'committed' && <div className="mt-3 border rounded p-3">
        <div className="d-flex flex-wrap gap-2 align-items-center mb-2"><h6 className="mb-0">逐笔修改</h6><Button size="sm" variant="outline-secondary" disabled={busy || !activeBatch.can_revert_edit} onClick={revertEdit}>撤销上次修改</Button>{!preview && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => setShowCategoryCreate(true)}>自定义分类</Button>}</div>
        <p className="small text-muted">可改分类、收款类型和退款关联；待核对记录确认类型并补齐关联后才计入统计。可在最近账单删除单笔记录，通过“撤销上次修改”恢复。金额或日期有误时，也可撤销整批后重新导入。</p>
        <div className="table-responsive" style={{ maxHeight: '30vh' }}><Table size="sm"><thead><tr><th>日期</th><th>类型</th><th>金额</th><th>当前分类</th><th>修改</th></tr></thead><tbody>{activeBatch.rows.map(row => {
          const change = rowDrafts[row.row_id] || {};
          const kind = effectiveKind(row, change);
          const link = change.related_source_id ?? row.related_source_id ?? '';
          return <tr key={row.row_id}>
            <td>{row.date}</td><td>{typeLabel[kind]}{row.decision === 'review' && <small className="d-block">尚未计入统计</small>}{row.decision === 'deleted' && <small className="d-block text-muted">已删除，不参与统计</small>}</td><td>¥{row.amount}</td>
            <td>{row.custom_category_name || (row.transaction_type === 'refund' ? `关联 ${row.related_source_id || '尚未选择'}` : receiptLabel[row.receipt_kind] || row.category)}</td>
            <td>{row.decision === 'deleted' ? <span className="small text-muted">删除记录保留在导入历史中</span> : <>{kind === 'expense' ? <Form.Select size="sm" aria-label={`修改第 ${row.row_id} 行类别`} value={change.category || row.category} disabled={busy} onChange={e => setRowDraft(row.row_id, 'category', e.target.value)}>{[...new Set([row.category, ...categories])].filter(Boolean).map(value => <option key={value}>{value}</option>)}</Form.Select>
              : kind === 'refund' ? <ImportPurchaseEditor label={`修改第 ${row.row_id} 行退款关联`} source={activeBatch.source} value={purchaseValue({ source_transaction_id: link, source: change.related_source || row.related_source || activeBatch.source }, activeBatch.source)} purchases={importedPurchases} disabled={busy} onChange={(id, from) => choosePurchase(row, id, from, true)} onAdded={purchase => addedPurchase(purchase, true)} onError={setError} onBusyChange={setChildBusy} />
                : ['income', 'transfer'].includes(kind) && (kind === 'income' || ['income', '收入', 'neutral'].includes(row.direction)) ? <Form.Select size="sm" aria-label={`修改第 ${row.row_id} 行收款类型`} value={change.receipt_kind || row.receipt_kind || 'internal_transfer'} disabled={busy} onChange={e => setRowDraft(row.row_id, 'receipt_kind', e.target.value)}>{Object.entries(receiptLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Form.Select> : null}
              <CustomBillCategorySelect label={`修改第 ${row.row_id} 行自定义分类`} row={row} change={change} options={customOptions} disabled={busy} onChange={id => chooseCustom(row.row_id, id, true)} />
              <Button size="sm" variant="outline-success" disabled={busy || !rowDrafts[row.row_id]} onClick={() => saveRow(row)}>保存</Button></>}
            </td>
          </tr>;
        })}</tbody></Table></div>
      </div>}
      <BillCategoryManager options={customOptions} disabled={busy} onUpdated={upsertOption} onError={setError} onBusyChange={setChildBusy} />
    </Modal.Body>
    <Modal.Footer><Button variant="outline-secondary" disabled={busy} onClick={onClose}>完成</Button></Modal.Footer>
  </Modal>
    {showCategoryCreate && <BillCategoryCreateModal defaultType={entryMode === 'receipt' ? 'income' : 'expense'} onClose={() => setShowCategoryCreate(false)} onCreated={categoryCreated} onBusyChange={setChildBusy} />}
    <Modal show={showBulkApply} centered onHide={() => setShowBulkApply(false)} aria-labelledby="bill-category-bulk-title">
      <Modal.Header closeButton><Modal.Title id="bill-category-bulk-title">应用分类到已选记录</Modal.Title></Modal.Header>
      <Modal.Body>
        {bulkError && <Alert variant="danger" role="alert">{bulkError}</Alert>}
        <Form.Group controlId="bill-category-bulk"><Form.Label>应用分类</Form.Label><Form.Select value={bulkCategory} onChange={e => { setBulkCategory(e.target.value); setBulkError(''); }}><option value="">选择要应用的分类</option>{bulkOptions.map(option => <option key={option.id} value={option.id}>{option.name} · {accountingLabels[option.accounting_type]}</option>)}</Form.Select></Form.Group>
        <p className="small text-muted mt-2 mb-0">将修改 {bulkRows.length} 行的分类，确认导入后才入账。这里只显示适用于全部已选记录的分类。</p>
        {!bulkOptions.length && <p className="small text-muted mt-2 mb-0">暂无适用分类，请先新增分类，或按收支类型分组选取记录。</p>}
      </Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" onClick={() => setShowBulkApply(false)}>取消</Button><Button variant="success" disabled={busy || !bulkOptions.some(option => option.id === bulkCategory) || !bulkRows.length} onClick={bulkApply}>确认应用</Button></Modal.Footer>
    </Modal>
  </>;
}
