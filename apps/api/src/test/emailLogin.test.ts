import request from 'supertest';
import { expect, it } from 'vitest';
import { createHarness } from './harness.js';

it('login menerima email tanpa membedakan kapital dan menolak username lama', async () => {
  const h = await createHarness();
  await h.createUser('existing', 'admin');
  const login = () => request(h.app).post('/api/v3/auth/login');
  const password = 'password-rahasia-1';
  expect((await login().send({ email: ' Existing@Example.TEST ', password })).status).toBe(200);
  expect((await login().send({ username: 'existing', password })).status).toBe(400);
  expect((await login().send({ email: 'existing', password })).status).toBe(400);
  expect((await login().send({ email: 'existing@example.test', password: 'wrong' })).status).toBe(401);
});
