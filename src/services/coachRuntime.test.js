import axios from 'axios';
jest.mock('axios', () => ({ create: jest.fn() }));
jest.mock('./firebase', () => ({ app: null }));
const client = { post: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
axios.create.mockReturnValue(client);
const { sendMessageToCoach } = require('./api');
beforeEach(() => client.post.mockReset());
test.each(['model', 'rule', 'guided'])('preserves %s runtime metadata from the transport', async mode => {
  const runtime = { generation_mode: mode, model: 'fixture', protocol_version: 'test-v1' };
  client.post.mockResolvedValue({ data: { status: 'success', reply: 'test', runtime, evidence: { facts: [] } } });
  const result = await sendMessageToCoach({ message: 'budget' });
  expect(result.runtime).toEqual(runtime);
  expect(result.evidence).toEqual({ facts: [] });
});
test('older successful responses do not invent a generation mode', async () => {
  client.post.mockResolvedValue({ data: { status: 'success', reply: 'test' } });
  expect((await sendMessageToCoach({ message: 'budget' })).runtime).toBeUndefined();
});
test('unsuccessful answers still reject', async () => {
  client.post.mockResolvedValue({ data: { status: 'error', message: 'unavailable', runtime: { generation_mode: 'model' } } });
  await expect(sendMessageToCoach({ message: 'budget' })).rejects.toThrow('unavailable');
});
