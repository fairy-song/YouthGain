import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BucketSwitcher } from './LedgerGoals';
import { updateGoal } from '../../services/api';
jest.mock('../../services/api', () => ({ createGoal: jest.fn(), updateGoal: jest.fn() }));

test('late goal loading fills the bucket and saving preserves the original deadline', async () => {
  const saved = jest.fn().mockResolvedValue();
  const view = render(<BucketSwitcher goals={[]} onSaved={saved} />);
  view.rerender(<BucketSwitcher goals={[{ id: 'g1', title: '应急储蓄', status: 'active', target_amount: 1000, current_amount: 200, deadline: '2027-02-01' }]} onSaved={saved} />);
  expect(screen.getByLabelText('目标金额')).toHaveValue(1000);
  fireEvent.change(screen.getByLabelText('已存金额'), { target: { value: '250' } });
  updateGoal.mockResolvedValue({});
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  await waitFor(() => expect(updateGoal).toHaveBeenCalledWith('g1', expect.objectContaining({ deadline: '2027-02-01', current_amount: 250 })));
  expect(await screen.findByRole('status')).toHaveTextContent('应急储蓄已保存');
});
