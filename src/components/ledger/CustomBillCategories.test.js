import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BillCategoryManager } from './CustomBillCategories';
import { updateBillCategory } from '../../services/api';
jest.mock('../../services/api', () => ({ updateBillCategory: jest.fn() }));
const original = { id: 'one', name: '旧分类', accounting_type: 'expense', active: true };
function Harness() {
  const [option, setOption] = useState(original);
  const [error, setError] = useState('');
  return <><BillCategoryManager options={[option]} onUpdated={setOption} onError={setError} />{error && <p role="alert">{error}</p>}</>;
}
beforeEach(() => jest.resetAllMocks());
test('successful rename adopts canonical name and disables repeat save', async () => {
  updateBillCategory.mockResolvedValue({ ...original, name: '教材' });
  render(<Harness />);
  fireEvent.click(screen.getByText('管理我的自定义分类（1）'));
  fireEvent.change(screen.getByLabelText('重命名分类 旧分类'), { target: { value: ' 教材 ' } });
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }));
  expect(await screen.findByLabelText('重命名分类 教材')).toHaveValue('教材');
  expect(screen.getByRole('button', { name: '保存名称' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('名称已保存');
});
test('failure retains rename draft and has no success notice', async () => {
  updateBillCategory.mockRejectedValue(new Error('模拟失败'));
  render(<Harness />);
  fireEvent.click(screen.getByText('管理我的自定义分类（1）'));
  fireEvent.change(screen.getByLabelText('重命名分类 旧分类'), { target: { value: '保留草稿' } });
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }));
  await screen.findByText('模拟失败');
  expect(screen.getByLabelText('重命名分类 旧分类')).toHaveValue('保留草稿');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
test('disabling a category preserves its unsaved rename', async () => {
  updateBillCategory.mockResolvedValue({ ...original, active: false });
  render(<Harness />);
  fireEvent.click(screen.getByText('管理我的自定义分类（1）'));
  fireEvent.change(screen.getByLabelText('重命名分类 旧分类'), { target: { value: '未提交名称' } });
  fireEvent.click(screen.getByRole('button', { name: '停用' }));
  await waitFor(() => expect(updateBillCategory).toHaveBeenCalledWith('one', { active: false }));
  await screen.findByRole('button', { name: '启用' });
  expect(screen.getByLabelText('重命名分类 旧分类')).toHaveValue('未提交名称');
});
