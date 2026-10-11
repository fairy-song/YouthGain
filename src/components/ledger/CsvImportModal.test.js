import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CsvImportModal from './CsvImportModal';
import { confirmBillImport, editBillImportRow, getBillImport, listBillImports, previewBillImport, revertBillImportEdit } from '../../services/api';

jest.mock('../../services/api', () => ({
  confirmBillImport: jest.fn(), editBillImportRow: jest.fn(), getBillImport: jest.fn(),
  listBillImports: jest.fn(), previewBillImport: jest.fn(), revertBillImportEdit: jest.fn(), undoBillImport: jest.fn(),
}));

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
  fireEvent.change(screen.getByLabelText('第 3 行类别'), { target: { value: '餐饮' } });
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
  expect(await screen.findByLabelText('第 4 行对应原支出')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('第 4 行对应原支出'), { target: { value: 'P-1' } });
  fireEvent.change(screen.getByLabelText('第 3 行收款类型'), { target: { value: 'red_packet' } });
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
