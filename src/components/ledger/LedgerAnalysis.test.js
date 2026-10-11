import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LedgerAnalysis from './LedgerAnalysis';

const props = { surplus: 100, income: 2000, avgSpending: 1900, discretionary: 100, patterns: [] };

test('shows insufficient data without component conclusions', () => {
  render(<LedgerAnalysis {...props} pca={{ status: 'insufficient_data', message: '至少需要 12 周', limitation: '漏记会影响结果' }} />);
  expect(screen.getByText('至少需要 12 周')).toBeInTheDocument();
  expect(screen.queryByText('查看计算依据')).not.toBeInTheDocument();
});

test('shows component evidence and actual retained variance', () => {
  render(<LedgerAnalysis {...props} pca={{ status: 'ready', message: '比较完整周', limitation: '不代表因果',
    start: '2026-01-05', end: '2026-04-26', retained_variance_ratio: .75,
    components: [{ id: 'PC1', title: '共同变化方向 1', detail: '每周笔数共同变化', explained_variance_ratio: .75,
      contributions: [{ feature: 'frequency', label: '每周消费笔数', contribution: .6, loading: .77 }] }] }} />);
  expect(screen.getByText(/保留约 75.0%/)).toBeInTheDocument();
  expect(screen.getByText(/贡献 60.0%/)).toBeInTheDocument();
  expect(screen.getByText(/解释比例不是准确率/)).toBeInTheDocument();
});
