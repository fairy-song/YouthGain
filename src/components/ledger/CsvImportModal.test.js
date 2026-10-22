import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CsvImportModal from './CsvImportModal';
import { dateKey } from '../FinanceVisuals';
import { confirmBillImport, editBillImportRow, getBillImport, listBillImports, listBillCategories, createBillCategory, deleteBillCategory, supplementBillPurchase, previewBillImport, revertBillImportEdit } from '../../services/api';

jest.mock('../../services/api', () => ({
  confirmBillImport: jest.fn(), editBillImportRow: jest.fn(), getBillImport: jest.fn(),
  listBillImports: jest.fn(), previewBillImport: jest.fn(), revertBillImportEdit: jest.fn(), undoBillImport: jest.fn(),
  listBillCategories: jest.fn(), createBillCategory: jest.fn(), deleteBillCategory: jest.fn(), updateBillCategory: jest.fn(), supplementBillPurchase: jest.fn(),
}));
beforeEach(() => { jest.clearAllMocks(); listBillCategories.mockResolvedValue([]); });

test('deleted imported rows remain visible as history without editable accounting controls', async () => {
  listBillImports.mockResolvedValue([{ sha256: 'deleted-batch', source: 'wechat', count: 1, status: 'committed' }]);
  getBillImport.mockResolvedValue({ sha256: 'deleted-batch', source: 'wechat', status: 'committed', can_revert_edit: true,
    rows: [{ row_id: 9, date: '2026-10-01', transaction_type: 'refund', amount: '10.00', category: '餐饮', decision: 'deleted', related_source_id: 'P-1' }] });
  render(<CsvImportModal onClose={() => {}} onSaved={async () => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '查看并修改' }));
  expect(await screen.findByText('已删除，不参与统计')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: '修改第 9 行退款关联' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '撤销上次修改' })).toBeEnabled();
});

async function openCategory(label) {
  fireEvent.click(await screen.findByRole('combobox', { name: label }));
  return screen.findByRole('listbox', { name: `${label}选项` });
}
async function chooseCategory(label, value) {
  const menu = await openCategory(label);
  const option = within(menu).getAllByRole('option').find(item => item.getAttribute('data-value') === value);
  expect(option).toBeDefined();
  fireEvent.click(option);
}

test('previews and confirms only selected valid rows, then refreshes the ledger', async () => {
  listBillImports.mockResolvedValue([]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'abc', counts: { import: 1, duplicate: 0, review: 1 },
    rows: [
      { row_id: 3, date: '2026-10-01', transaction_type: 'expense', amount: '18.50', category: '未分类', merchant: '食堂', decision: 'import' },
      { row_id: 4, date: '2026-10-01', transaction_type: 'refund', amount: '2.00', category: '未分类', merchant: '食堂', decision: 'review', reason: '无法关联原支出' },
    ] });
  confirmBillImport.mockResolvedValue({ created: true, count: 1 });
  const onSaved = jest.fn().mockResolvedValue(undefined);
  render(<CsvImportModal onClose={() => {}} onSaved={onSaved} />);
  expect(screen.getByLabelText(/文件（CSV \/ XLSX/).getAttribute('accept')).toContain('.xlsx');
  const file = new File(['test'], 'bill.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  await screen.findByText(/可导入 1 行/);
  expect(screen.getByLabelText('选择第 4 行')).toBeDisabled();
  await chooseCategory('第 3 行分类', 'expense:餐饮');
  fireEvent.click(screen.getByRole('button', { name: '确认导入 1 行' }));
  await waitFor(() => expect(confirmBillImport).toHaveBeenCalledWith(file, 'wechat', 'abc', [3], { 3: '餐饮' }, {}));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

test('accepts a WeChat XLSX file for preview without converting it in the browser', async () => {
  listBillImports.mockResolvedValue([]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'xlsx', counts: { import: 0, duplicate: 0, review: 0 }, rows: [] });
  render(<CsvImportModal onClose={() => {}} onSaved={() => {}} />);
  const file = new File(['spreadsheet'], '微信账单.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  await waitFor(() => expect(previewBillImport).toHaveBeenCalledWith(file, 'wechat'));
});

test('receipt entrance classifies an incoming transfer and links a refund before import', async () => {
  listBillImports.mockResolvedValue([]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'receipt', already_imported: true, counts: { import: 1, duplicate: 0, review: 1 },
    by_type: { income: 1, refund: 0 }, purchase_options: [{ source_transaction_id: 'P-1', date: '2026-10-01', amount: '100.00', merchant: '书店' }],
    rows: [
      { row_id: 3, date: '2026-10-01', transaction_type: 'income', receipt_kind: 'external_transfer', amount: '30.00', merchant: '同学', decision: 'import' },
      { row_id: 4, date: '2026-10-01', transaction_type: 'refund', amount: '5.00', merchant: '书店', decision: 'review', reason: '未找到唯一的原交易，请手动关联' },
    ] });
  confirmBillImport.mockResolvedValue({ created: true, count: 2 });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  expect(screen.getByText('导入收款账单')).toBeInTheDocument();
  const file = new File(['receipt'], 'receipt.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  fireEvent.click(await screen.findByRole('button', { name: '第 4 行关联原支出' }));
  expect(await screen.findByLabelText('第 4 行对应原支出')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('第 4 行对应原支出'), { target: { value: 'P-1' } });
  await chooseCategory('第 3 行分类', 'receipt:red_packet');
  expect(screen.getByText(/仍可核对并追加其他行/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认导入 2 行' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '确认导入 2 行' }));
  await waitFor(() => expect(confirmBillImport).toHaveBeenCalledWith(file, 'wechat', 'receipt', expect.arrayContaining([3, 4]), {},
    { 3: { receipt_kind: 'red_packet' }, 4: { related_source_id: 'P-1' } }));
});

test('a committed row can be changed and the last edit reverted', async () => {
  listBillImports.mockResolvedValue([{ sha256: 'a'.repeat(64), source: 'wechat', count: 1, status: 'committed', created_at: '2026-10-11' }]);
  const detail = { sha256: 'a'.repeat(64), source: 'wechat', status: 'committed', can_revert_edit: false,
    purchase_options: [], rows: [{ row_id: 3, date: '2026-10-11', transaction_type: 'income', receipt_kind: 'red_packet', amount: '30.00' }] };
  getBillImport.mockResolvedValue(detail);
  editBillImportRow.mockResolvedValue({ ...detail, can_revert_edit: true, rows: [{ ...detail.rows[0], receipt_kind: 'external_transfer' }] });
  revertBillImportEdit.mockResolvedValue(detail);
  render(<CsvImportModal onClose={() => {}} onSaved={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '查看并修改' }));
  fireEvent.change(await screen.findByLabelText('修改第 3 行收款类型'), { target: { value: 'external_transfer' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(editBillImportRow).toHaveBeenCalledWith('a'.repeat(64), 3, { receipt_kind: 'external_transfer' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '撤销上次修改' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '撤销上次修改' }));
  await waitFor(() => expect(revertBillImportEdit).toHaveBeenCalledWith('a'.repeat(64)));
});

test('creates and uses a private custom income label before confirming', async () => {
  listBillImports.mockResolvedValue([]);
  createBillCategory.mockResolvedValue({ id: 'bill-category:scholarship', name: '奖学金', accounting_type: 'income', active: true });
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'custom', counts: { import: 1, review: 0, duplicate: 0 }, rows: [
    { row_id: 2, date: '2026-10-01', transaction_type: 'income', receipt_kind: 'other_income', amount: '100', category: '未分类', decision: 'import', direction: '收入' },
  ] });
  confirmBillImport.mockResolvedValue({ created: true, count: 1 });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  const file = new File(['custom'], 'bill.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  fireEvent.click(await screen.findByRole('button', { name: '自定义分类', exact: true }));
  const dialog = screen.getByRole('dialog', { name: '新增自定义分类' });
  fireEvent.change(within(dialog).getByLabelText('分类名称'), { target: { value: '奖学金' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存分类' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增自定义分类' })).not.toBeInTheDocument());
  expect(listBillCategories).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('第 2 行分类')).toHaveValue('receipt:other_income');
  await chooseCategory('第 2 行分类', 'custom:bill-category:scholarship');
  expect(createBillCategory).toHaveBeenCalledWith({ name: '奖学金', accounting_type: 'income' });
  fireEvent.click(screen.getByRole('button', { name: '确认导入 1 行' }));
  await waitFor(() => expect(confirmBillImport).toHaveBeenCalledWith(file, 'wechat', 'custom', [2], {}, { 2: { category_id: 'bill-category:scholarship' } }));
});

test('one toolbar creates a category for all compatible selects and bulk applies only selected rows', async () => {
  const existing = { id: 'bill-category:family', name: '家人生活费', accounting_type: 'income', active: true };
  const added = { id: 'bill-category:scholarship', name: '奖学金', accounting_type: 'income', active: true };
  listBillImports.mockResolvedValue([]);
  listBillCategories.mockResolvedValueOnce([existing]).mockResolvedValue([existing, added]);
  createBillCategory.mockResolvedValue(added);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'bulk', counts: { import: 2, review: 0, duplicate: 0 }, rows: [
    { row_id: 2, date: '2026-10-01', transaction_type: 'income', receipt_kind: 'other_income', amount: '100', category: '未分类', decision: 'import', direction: '收入' },
    { row_id: 3, date: '2026-10-01', transaction_type: 'income', receipt_kind: 'other_income', amount: '200', category: '未分类', decision: 'import', direction: '收入' },
  ] });
  confirmBillImport.mockResolvedValue({ created: true, count: 1 });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  const file = new File(['bulk'], 'bill.csv');
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  await screen.findByLabelText('第 2 行分类');
  expect(screen.queryByRole('button', { name: '＋自定义分类' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: '批量自定义分类' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '选择自定义分类' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '自定义分类', exact: true })).toHaveLength(1);
  await chooseCategory('第 3 行分类', `custom:${existing.id}`);
  fireEvent.click(screen.getByRole('button', { name: '自定义分类', exact: true }));
  const createDialog = screen.getByRole('dialog', { name: '新增自定义分类' });
  fireEvent.change(within(createDialog).getByLabelText('分类名称'), { target: { value: ' 奖学金 ' } });
  fireEvent.click(within(createDialog).getByRole('button', { name: '保存分类' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增自定义分类' })).not.toBeInTheDocument());
  expect(createBillCategory).toHaveBeenCalledWith({ name: '奖学金', accounting_type: 'income' });
  for (const rowId of [2, 3]) {
    const menu = await openCategory(`第 ${rowId} 行分类`);
    expect(within(menu).getByRole('option', { name: '奖学金 · 收入' })).toBeInTheDocument();
    expect(within(menu).getByRole('option', { name: '家人生活费 · 收入' })).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
  }
  expect(screen.getByLabelText('第 3 行分类')).toHaveValue(`custom:${existing.id}`);
  fireEvent.click(screen.getByLabelText('选择第 3 行'));
  fireEvent.click(screen.getByRole('button', { name: '应用到已选记录' }));
  const bulkDialog = screen.getByRole('dialog', { name: '应用分类到已选记录' });
  expect(within(bulkDialog).getByLabelText('应用分类')).toHaveValue(added.id);
  fireEvent.click(within(bulkDialog).getByRole('button', { name: '确认应用' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '应用分类到已选记录' })).not.toBeInTheDocument());
  expect(screen.getByLabelText('第 2 行分类')).toHaveValue(`custom:${added.id}`);
  expect(screen.getByLabelText('第 3 行分类')).toHaveValue(`custom:${existing.id}`);
  fireEvent.click(screen.getByRole('button', { name: '确认导入 1 行' }));
  await waitFor(() => expect(confirmBillImport).toHaveBeenCalledWith(file, 'wechat', 'bulk', [2], {}, {
    2: { category_id: added.id }, 3: { category_id: existing.id },
  }));
});

test('category creation errors stay in the dialog and can be retried without changing rows', async () => {
  listBillImports.mockResolvedValue([]);
  createBillCategory.mockRejectedValueOnce(new Error('分类名称已存在'));
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'error', counts: { import: 1, review: 0, duplicate: 0 }, rows: [
    { row_id: 2, date: '2026-10-01', transaction_type: 'expense', amount: '100', category: '学习', decision: 'import' },
  ] });
  render(<CsvImportModal onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [new File(['error'], 'bill.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  fireEvent.click(await screen.findByRole('button', { name: '自定义分类', exact: true }));
  const dialog = screen.getByRole('dialog', { name: '新增自定义分类' });
  fireEvent.change(within(dialog).getByLabelText('分类名称'), { target: { value: '学习' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存分类' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('分类名称已存在');
  expect(within(dialog).getByLabelText('分类名称')).toHaveValue('学习');
  expect(within(dialog).getByRole('button', { name: '保存分类' })).toBeEnabled();
  expect(listBillCategories).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialog).getByRole('button', { name: '取消', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增自定义分类' })).not.toBeInTheDocument());
  expect(screen.getByLabelText('第 2 行分类')).toHaveValue('expense:学习');
});

test('bulk classification excludes incompatible accounting types', async () => {
  listBillImports.mockResolvedValue([]);
  listBillCategories.mockResolvedValue([{ id: 'bill-category:income', name: '奖学金', accounting_type: 'income', active: true }]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'mixed', counts: { import: 2, review: 0, duplicate: 0 }, rows: [
    { row_id: 2, transaction_type: 'expense', amount: '100', category: '学习', decision: 'import' },
    { row_id: 3, transaction_type: 'income', amount: '200', category: '未分类', decision: 'import', direction: '收入' },
  ] });
  render(<CsvImportModal onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [new File(['mixed'], 'bill.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  fireEvent.click(await screen.findByRole('button', { name: '应用到已选记录' }));
  const dialog = screen.getByRole('dialog', { name: '应用分类到已选记录' });
  expect(within(dialog).queryByRole('option', { name: '奖学金 · 收入' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '确认应用' })).toBeDisabled();
  expect(within(dialog).getByText(/暂无适用分类/)).toBeInTheDocument();
});

test('allows an unlinked custom refund to be saved as pending without treating it as income', async () => {
  listBillImports.mockResolvedValue([]);
  listBillCategories.mockResolvedValue([{ id: 'bill-category:refund', name: '教材退款', accounting_type: 'refund', active: true }]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'pending', purchase_options: [], counts: { import: 0, review: 1, duplicate: 0 }, rows: [
    { row_id: 2, date: '2026-10-01', transaction_type: 'refund', amount: '20', category: '未分类', decision: 'review', reason: '找不到可关联的原支出' },
  ] });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [new File(['pending'], 'bill.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  await chooseCategory('第 2 行分类', 'custom:bill-category:refund');
  expect(screen.getByText('保存为待核对，不参与统计')).toBeInTheDocument();
  expect(screen.getByLabelText('选择第 2 行')).toBeChecked();
  expect(screen.getByRole('button', { name: '确认导入 1 行' })).toBeEnabled();
});

test('searches manual expenses and can supplement an original expense then link it', async () => {
  listBillImports.mockResolvedValue([]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'search', counts: { import: 0, review: 1, duplicate: 0 }, purchase_options: [
    { source: 'manual', source_transaction_id: 'M-1', date: '2026-10-01', amount: '100', merchant: '书店', category: '学习' },
    { source: 'wechat', source_transaction_id: 'P-2', date: '2026-10-01', amount: '20', merchant: '食堂', category: '餐饮' },
  ], rows: [{ row_id: 2, date: '2026-10-01', transaction_type: 'refund', amount: '10', category: '未分类', decision: 'review', reason: '找不到可关联的原支出' }] });
  supplementBillPurchase.mockResolvedValue({ source: 'wechat', source_transaction_id: 'P-NEW', date: '2026-10-01', amount: '50', category: '学习', merchant: '书店' });
  const onSaved = jest.fn();
  render(<CsvImportModal onClose={() => {}} onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [new File(['search'], 'bill.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  fireEvent.click(await screen.findByRole('button', { name: '第 2 行关联原支出' }));
  fireEvent.change(await screen.findByLabelText('第 2 行对应原支出搜索'), { target: { value: '书店' } });
  expect(screen.queryByRole('option', { name: /食堂/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('第 2 行对应原支出'), { target: { value: 'manual::M-1' } });
  fireEvent.click(screen.getByRole('button', { name: '找不到？补录原支出' }));
  fireEvent.change(screen.getByLabelText('第 2 行对应原支出原交易号'), { target: { value: 'P-NEW' } });
  fireEvent.change(screen.getByLabelText('第 2 行对应原支出原支出日期'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('第 2 行对应原支出原支付金额'), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText('第 2 行对应原支出原支出类别'), { target: { value: '学习' } });
  fireEvent.click(screen.getByRole('button', { name: '确认补录并关联' }));
  await waitFor(() => expect(screen.getByLabelText('第 2 行对应原支出')).toHaveValue('P-NEW'));
  expect(supplementBillPurchase).toHaveBeenCalledWith(expect.objectContaining({ transaction_id: 'P-NEW', amount: '50', category: '学习' }));
  expect(onSaved).toHaveBeenCalled();
});

test('outgoing transfers do not offer income types but still allow compatible custom labels', async () => {
  listBillImports.mockResolvedValue([]);
  listBillCategories.mockResolvedValue([{ id: 'bill-category:own', name: '银行卡划转', accounting_type: 'transfer', active: true }]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'outgoing', counts: { import: 1, review: 0, duplicate: 0 }, rows: [
    { row_id: 2, date: '2026-10-01', transaction_type: 'transfer', amount: '100', category: '未分类', decision: 'import', direction: '支出' },
  ] });
  render(<CsvImportModal onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [new File(['outgoing'], 'bill.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  const custom = await screen.findByLabelText('第 2 行分类');
  expect(screen.queryByLabelText('第 2 行收款类型')).not.toBeInTheDocument();
  await chooseCategory('第 2 行分类', 'custom:bill-category:own');
  expect(custom).toHaveValue('custom:bill-category:own');
});

test('preview keeps seven columns and one grouped category selector per collapsed row', async () => {
  listBillImports.mockResolvedValue([]);
  listBillCategories.mockResolvedValue([{ id: 'bill-category:income', name: '奖学金', accounting_type: 'income', active: true }]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'layout', counts: { import: 4, review: 0, duplicate: 0 }, rows: [
    { row_id: 2, transaction_type: 'income', receipt_kind: 'other_income', amount: '50', category: '未分类', decision: 'import', direction: '收入' },
    { row_id: 3, transaction_type: 'expense', amount: '100', category: '学习', decision: 'import' },
    { row_id: 4, transaction_type: 'transfer', amount: '30', category: '未分类', decision: 'import', direction: '支出' },
    { row_id: 5, transaction_type: 'refund', amount: '20', category: '未分类', decision: 'import', related_source_id: 'P-1' },
  ] });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [new File(['layout'], 'bill.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  const table = await screen.findByRole('table', { name: '账单导入预览' });
  expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['选择', '日期', '类型', '金额', '对方', '分类', '处理结果']);
  expect(within(table).getAllByRole('combobox')).toHaveLength(4);
  for (const row of within(table).getAllByRole('row').slice(1)) {
    expect(within(row).getAllByRole('cell')).toHaveLength(7);
    expect(within(row).getAllByRole('combobox')).toHaveLength(1);
    const select = within(row).getByRole('combobox');
    const menu = await openCategory(select.getAttribute('aria-label'));
    expect(within(menu).getByRole('group', { name: '系统分类' })).toBeInTheDocument();
    expect(within(menu).getByRole('group', { name: '用户自定义分类' })).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
  }
  const incomeMenu = await openCategory('第 2 行分类');
  expect(within(incomeMenu).getByRole('option', { name: '奖学金 · 收入' })).toBeInTheDocument();
  fireEvent.keyDown(incomeMenu, { key: 'Escape' });
  const expenseMenu = await openCategory('第 3 行分类');
  expect(within(expenseMenu).queryByRole('option', { name: '奖学金 · 收入' })).not.toBeInTheDocument();
  fireEvent.keyDown(expenseMenu, { key: 'Escape' });
  expect(within(table).getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: '第 5 行关联原支出' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByLabelText('第 5 行对应原支出')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '应用到已选记录' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '自定义分类', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认导入 4 行' })).toBeInTheDocument();
  expect(screen.getByText(/管理我的自定义分类/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '下载标准模板' })).toBeInTheDocument();
});

test('closing refund details preserves a cross-source association until confirmation', async () => {
  listBillImports.mockResolvedValue([]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'fold', counts: { import: 1, review: 0, duplicate: 0 },
    purchase_options: [{ source: 'manual', source_transaction_id: 'M-1', date: dateKey(), amount: '100', merchant: '书店', category: '学习' }],
    rows: [{ row_id: 2, date: dateKey(), transaction_type: 'refund', amount: '20', category: '未分类', decision: 'import', related_source_id: 'P-1' }] });
  confirmBillImport.mockResolvedValue({ created: true, count: 1 });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  const file = new File(['fold'], 'bill.csv');
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  const toggle = await screen.findByRole('button', { name: '第 2 行关联原支出' });
  fireEvent.click(toggle);
  const linkSelect = await screen.findByLabelText('第 2 行对应原支出');
  fireEvent.change(linkSelect, { target: { value: 'manual::M-1' } });
  fireEvent.click(toggle);
  expect(linkSelect.closest('.bill-refund-details')).toHaveAttribute('aria-hidden', 'true');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(screen.getByLabelText('第 2 行对应原支出')).toHaveValue('manual::M-1');
  fireEvent.click(screen.getByRole('button', { name: '确认导入 1 行' }));
  await waitFor(() => expect(confirmBillImport).toHaveBeenCalledWith(file, 'wechat', 'fold', [2], {}, {
    2: { related_source_id: 'M-1', related_source: 'manual' },
  }));
});

test('clearing a refund link removes its deduction from selected preview totals', async () => {
  listBillImports.mockResolvedValue([]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'clear-link', counts: { import: 1, review: 0, duplicate: 0 },
    purchase_options: [{ source_transaction_id: 'P-1', date: dateKey(), amount: '100', merchant: '书店', category: '学习' }],
    rows: [{ row_id: 2, date: dateKey(), transaction_type: 'refund', amount: '20', category: '未分类', decision: 'import', related_source_id: 'P-1' }] });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [new File(['clear-link'], 'bill.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  await screen.findByText(/预计本月支出变化 ¥-20.00/);
  fireEvent.click(screen.getByRole('button', { name: '第 2 行关联原支出' }));
  fireEvent.change(await screen.findByLabelText('第 2 行对应原支出'), { target: { value: '' } });
  expect(screen.getByText(/预计本月支出变化 ¥0.00/)).toBeInTheDocument();
});

test('switching a custom refund back to system income removes incompatible association edits', async () => {
  listBillImports.mockResolvedValue([]);
  listBillCategories.mockResolvedValue([{ id: 'bill-category:refund', name: '教材退款', accounting_type: 'refund', active: true }]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'switch-kind', counts: { import: 1, review: 0, duplicate: 0 },
    purchase_options: [{ source: 'manual', source_transaction_id: 'M-1', date: dateKey(), amount: '100', merchant: '书店', category: '学习' }],
    rows: [{ row_id: 2, date: dateKey(), transaction_type: 'income', amount: '20', receipt_kind: 'other_income', category: '未分类', decision: 'import', direction: '收入' }] });
  confirmBillImport.mockResolvedValue({ created: true, count: 1 });
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  const file = new File(['switch-kind'], 'bill.csv');
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  await screen.findByLabelText('第 2 行分类');
  await chooseCategory('第 2 行分类', 'custom:bill-category:refund');
  fireEvent.click(screen.getByRole('button', { name: '第 2 行关联原支出' }));
  fireEvent.change(await screen.findByLabelText('第 2 行对应原支出'), { target: { value: 'manual::M-1' } });
  await chooseCategory('第 2 行分类', 'receipt:red_packet');
  expect(screen.queryByRole('button', { name: '第 2 行关联原支出' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '确认导入 1 行' }));
  await waitFor(() => expect(confirmBillImport).toHaveBeenCalledWith(file, 'wechat', 'switch-kind', [2], {}, {
    2: { receipt_kind: 'red_packet' },
  }));
});

async function deletionPreview(kind = 'income') {
  const category = { id: 'bill-category:delete', name: kind === 'refund' ? '教材退款' : '奖学金', accounting_type: kind, active: true };
  listBillImports.mockResolvedValue([]);
  listBillCategories.mockResolvedValue([category]);
  previewBillImport.mockResolvedValue({ source: 'wechat', sha256: 'delete', counts: { import: 1, review: 0, duplicate: 0 },
    rows: [{ row_id: 2, date: dateKey(), transaction_type: 'income', amount: '20', receipt_kind: 'other_income', category: '未分类', decision: 'import', direction: '收入' }] });
  const file = new File(['delete'], 'bill.csv');
  render(<CsvImportModal entryMode="receipt" onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText(/文件（CSV \/ XLSX/), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: '预览账单' }));
  await screen.findByRole('combobox', { name: '第 2 行分类' });
  return { category, file };
}

test('delete icons belong only to custom options and cancelling keeps the menu open without selecting', async () => {
  const { category } = await deletionPreview();
  const menu = await openCategory('第 2 行分类');
  expect(within(within(menu).getByRole('group', { name: '系统分类' })).queryByRole('button')).not.toBeInTheDocument();
  fireEvent.click(within(menu).getByRole('button', { name: `删除分类 ${category.name}` }));
  const dialog = screen.getByRole('dialog', { name: '删除自定义分类' });
  expect(within(dialog).getByText('确认删除该自定义分类？')).toBeInTheDocument();
  expect(screen.getByLabelText('第 2 行分类')).toHaveValue('receipt:other_income');
  expect(deleteBillCategory).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '删除自定义分类' })).not.toBeInTheDocument());
  expect(await screen.findByRole('listbox', { name: '第 2 行分类选项' })).toBeInTheDocument();
  expect(within(menu).getByRole('option', { name: '奖学金 · 收入' })).toBeInTheDocument();
  expect(deleteBillCategory).not.toHaveBeenCalled();
  fireEvent.click(within(menu).getByRole('option', { name: '奖学金 · 收入' }));
  expect(screen.getByRole('combobox', { name: '第 2 行分类' })).toHaveValue(`custom:${category.id}`);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('successful deletion closes the menu, refreshes manager data and removes uncommitted references', async () => {
  const { category, file } = await deletionPreview();
  deleteBillCategory.mockResolvedValue({ ...category, deleted: true });
  confirmBillImport.mockResolvedValue({ created: true, count: 1 });
  await chooseCategory('第 2 行分类', `custom:${category.id}`);
  const menu = await openCategory('第 2 行分类');
  fireEvent.click(within(menu).getByRole('button', { name: '删除分类 奖学金' }));
  listBillCategories.mockResolvedValue([]);
  const dialog = screen.getByRole('dialog', { name: '删除自定义分类' });
  fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '删除自定义分类' })).not.toBeInTheDocument());
  expect(deleteBillCategory).toHaveBeenCalledWith(category.id);
  expect(listBillCategories).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByText('管理我的自定义分类（0）')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '第 2 行分类' })).toHaveValue('receipt:other_income');
  const refreshed = await openCategory('第 2 行分类');
  expect(within(refreshed).queryByRole('option', { name: '奖学金 · 收入' })).not.toBeInTheDocument();
  fireEvent.keyDown(refreshed, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: '确认导入 1 行' }));
  await waitFor(() => expect(confirmBillImport).toHaveBeenCalledWith(file, 'wechat', 'delete', [2], {}, {}));
});

test('failed deletion keeps the category and selection and allows cancellation back to the open menu', async () => {
  const { category } = await deletionPreview();
  deleteBillCategory.mockRejectedValueOnce(new Error('分类服务暂时不可用'));
  await chooseCategory('第 2 行分类', `custom:${category.id}`);
  const menu = await openCategory('第 2 行分类');
  fireEvent.click(within(menu).getByRole('button', { name: '删除分类 奖学金' }));
  const dialog = screen.getByRole('dialog', { name: '删除自定义分类' });
  fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('分类服务暂时不可用');
  expect(listBillCategories).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('第 2 行分类')).toHaveValue(`custom:${category.id}`);
  fireEvent.click(within(dialog).getByRole('button', { name: '取消', exact: true }));
  await screen.findByRole('listbox', { name: '第 2 行分类选项' });
  expect(screen.getByText('管理我的自定义分类（1）')).toBeInTheDocument();
  expect(within(menu).getByRole('option', { name: '奖学金 · 收入' })).toBeInTheDocument();
});

test('deleting a refund label used on an incoming row requires reconfirming its restored type', async () => {
  const { category } = await deletionPreview('refund');
  deleteBillCategory.mockResolvedValue({ ...category, deleted: true });
  await chooseCategory('第 2 行分类', `custom:${category.id}`);
  expect(screen.getByRole('button', { name: '第 2 行关联原支出' })).toHaveAttribute('aria-expanded', 'false');
  const menu = await openCategory('第 2 行分类');
  fireEvent.click(within(menu).getByRole('button', { name: '删除分类 教材退款' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: '删除自定义分类' })).getByRole('button', { name: '确认删除' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '删除自定义分类' })).not.toBeInTheDocument());
  expect(screen.getByLabelText('选择第 2 行')).not.toBeChecked();
  expect(screen.getByRole('button', { name: '确认导入 0 行' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: '第 2 行分类' })).toHaveValue('receipt:other_income');
  expect(screen.queryByRole('button', { name: '第 2 行关联原支出' })).not.toBeInTheDocument();
});
