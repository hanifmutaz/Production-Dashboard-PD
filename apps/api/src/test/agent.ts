import request from 'supertest';
import type { Harness } from './harness.js';

/** Login lalu kembalikan agent supertest yang membawa cookie sesi + header CSRF untuk request tulis. */
export async function loginAs(h: Harness, username: string, password = 'password-rahasia-1') {
  const agent = request.agent(h.app);
  const res = await agent.post('/api/v3/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login gagal ${res.status} ${JSON.stringify(res.body)}`);
  return {
    get: (url: string) => agent.get(url),
    put: (url: string, body: unknown) =>
      agent
        .put(url)
        .set('x-v3-csrf', '1')
        .send(body as object),
    post: (url: string, body: unknown) =>
      agent
        .post(url)
        .set('x-v3-csrf', '1')
        .send(body as object),
    patch: (url: string, body: unknown) =>
      agent
        .patch(url)
        .set('x-v3-csrf', '1')
        .send(body as object),
    delete: (url: string) => agent.delete(url).set('x-v3-csrf', '1'),
    raw: agent,
  };
}
