import { calculateTool } from './KnowledgeTools';
test('预算显示余额和缺口', () => {
  expect(calculateTool('budget', ['2000','1400','200']).value).toBe(400);
  expect(calculateTool('budget', ['100','150','0']).value).toBe(-50);
});
test('储蓄按月分配，不把已有储蓄重复计算', () => {
  expect(calculateTool('saving', ['4000','1000','6']).value).toBe(500);
  expect(calculateTool('saving', ['100','200','6']).value).toBe(0);
});
test('分期包括首付和额外费用', () => {
  expect(calculateTool('installment', ['2400','210','12','100','20']).value).toBe(2640);
});
test.each([['saving',['100','0','0']], ['saving',['100','0','1.5']], ['budget',['','0','0']], ['budget',['100','-1','0']]])('拒绝无效输入 %s %j', (mode, values) => {
  expect(calculateTool(mode, values).error).toBeTruthy();
});
