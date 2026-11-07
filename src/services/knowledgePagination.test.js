import axios from 'axios';
jest.mock('axios', () => ({ create: jest.fn() }));
jest.mock('./firebase', () => ({ app: null }));
const client = { get: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
axios.create.mockReturnValue(client);
const { fetchKnowledgeArticles } = require('./api');

beforeEach(() => client.get.mockReset());

test('reads later pages with the same publication snapshot', async () => {
  client.get.mockResolvedValueOnce({ data: { articles: [{ id: 'a' }], next_offset: 200, snapshot: 'v1' } })
    .mockResolvedValueOnce({ data: { articles: [{ id: 'b' }], next_offset: null, snapshot: 'v1' } });
  expect(await fetchKnowledgeArticles()).toEqual([{ id: 'a' }, { id: 'b' }]);
  expect(client.get).toHaveBeenLastCalledWith('/knowledge', { params: { offset: 200, limit: 200, snapshot: 'v1' } });
});

test('starts again after a publication changes without mixing snapshots', async () => {
  client.get.mockResolvedValueOnce({ data: { articles: [{ id: 'old' }], next_offset: 200, snapshot: 'v1' } })
    .mockRejectedValueOnce({ response: { status: 409 } })
    .mockResolvedValueOnce({ data: { articles: [{ id: 'new' }], next_offset: null, snapshot: 'v2' } });
  expect(await fetchKnowledgeArticles()).toEqual([{ id: 'new' }]);
});

test('rejects a non-advancing pagination cursor', async () => {
  client.get.mockResolvedValue({ data: { articles: [], next_offset: 0 } });
  await expect(fetchKnowledgeArticles()).rejects.toThrow('知识库分页无效');
});
