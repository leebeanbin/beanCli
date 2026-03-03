import { ApiClient } from './ApiClient.js';

function makeResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    statusText: ok ? 'OK' : 'Bad Request',
  } as unknown as Response;
}

describe('ApiClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('get() sends GET request with query params', async () => {
    fetchMock.mockResolvedValue(makeResponse(true, 200, { items: [] }));

    const client = new ApiClient({ baseUrl: 'http://localhost:3000', getAccessToken: () => null });
    const res = await client.get('/api/v1/changes', { status: 'FAILED', limit: '10' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('status=FAILED');
    expect(calledUrl).toContain('limit=10');
    expect(calledOpts.method).toBe('GET');
    expect(res.ok).toBe(true);
  });

  it('get() includes Authorization header when token is present', async () => {
    fetchMock.mockResolvedValue(makeResponse(true, 200, {}));

    const client = new ApiClient({ baseUrl: 'http://localhost:3000', getAccessToken: () => 'my-token' });
    await client.get('/api/v1/changes');

    const [, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((calledOpts.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token');
  });

  it('get() omits Authorization header when no token', async () => {
    fetchMock.mockResolvedValue(makeResponse(true, 200, {}));

    const client = new ApiClient({ baseUrl: 'http://localhost:3000', getAccessToken: () => null });
    await client.get('/api/v1/changes');

    const [, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((calledOpts.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('post() sends POST with Content-Type and JSON body', async () => {
    fetchMock.mockResolvedValue(makeResponse(true, 201, { id: 'abc' }));

    const client = new ApiClient({ baseUrl: 'http://localhost:3000', getAccessToken: () => null });
    const res = await client.post('/api/v1/changes', { sql: 'SELECT 1', environment: 'DEV' });

    const [, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledOpts.method).toBe('POST');
    expect((calledOpts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(calledOpts.body).toBe(JSON.stringify({ sql: 'SELECT 1', environment: 'DEV' }));
    expect(res.ok).toBe(true);
  });

  it('returns { ok: false, error } on HTTP 4xx response', async () => {
    fetchMock.mockResolvedValue(makeResponse(false, 403, { error: 'Forbidden' }));

    const client = new ApiClient({ baseUrl: 'http://localhost:3000', getAccessToken: () => null });
    const res = await client.get('/api/v1/approvals/pending');

    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.error).toBe('Forbidden');
  });

  it('returns { ok: false, status: 0, error } when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('Network failure'));

    const client = new ApiClient({ baseUrl: 'http://localhost:3000', getAccessToken: () => null });
    const res = await client.get('/api/v1/changes');

    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.error).toBe('Network failure');
  });
});
