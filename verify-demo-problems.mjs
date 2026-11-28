import assert from 'node:assert/strict';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {testSession} from './tests/session-fixture.mjs';

const base = 'https://planwithgoplan.com';
const DB = localDatabase(':memory:');
const env = {DB, ADMIN_EMAILS: 'owner@example.com', FEEDBACK_REVIEW_KEY: 'test-operator'};
const student = await testSession(DB, 'reporter');
const other = await testSession(DB, 'other');
const owner = await testSession(DB, 'owner');
const submit = (who, data, extra = {}) => handleApi(new Request(base + '/api/demo/problems', {
  method: 'POST', headers: {...who, Origin: base, 'Content-Type': 'application/json', ...extra},
  body: JSON.stringify(data)
}), env);
const inbox = (who, query = '') => handleApi(new Request(base + '/api/admin/demo-problems' + query, {headers: who}), env);
const draft = () => ({requestId: crypto.randomUUID(), message: 'The semester board did not open.'});
try {
  const report = {...draft(), email: 'forged@example.com', workspace: 'private example'};
  assert.equal((await submit({}, report)).status, 401);
  assert.equal((await submit(student, report, {Origin: 'https://elsewhere.example'})).status, 403);
  assert.equal((await submit(student, report, {'Content-Type': 'text/plain'})).status, 415);
  for (const message of ['', '   ', 'x'.repeat(2001)]) {
    assert.equal((await submit(student, {...report, message})).status, 400);
  }
  assert.equal((await submit(student, {...report, message: 'x'.repeat(20000)})).status, 413);
  assert.equal((await submit(student, {...report, requestId: 'invalid'})).status, 400);
  const responses = await Promise.all([submit(student, report), submit(student, report)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
  assert.deepEqual(await responses[0].json(), {received: true});
  assert.equal((await submit(student, {...report, message: 'Changed report.'})).status, 409);
  for (const who of [{}, student, other, {Authorization: 'Bearer test-operator'}]) {
    assert.ok([401, 403].includes((await inbox(who)).status));
  }
  const response = await inbox(owner);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const {reports} = await response.json();
  assert.equal(reports.length, 1);
  assert.deepEqual(Object.keys(reports[0]).sort(), ['createdAt', 'email', 'id', 'message']);
  assert.equal(reports[0].message, report.message);
  assert.equal(reports[0].email, 'reporter@example.com');
  for (let i = 1; i < 8; i++) assert.equal((await submit(student, draft())).status, 201);
  assert.equal((await submit(student, draft())).status, 429);
  assert.equal((await submit(student, report)).status, 200);
  assert.equal((await submit(other, report)).status, 201);

  for (let i = 0; i < 3; i++) {
    const account = await testSession(DB, 'additional-' + i);
    for (let j = 0; j < 6; j++) assert.equal((await submit(account, draft())).status, 201);
  }
  const first = await (await inbox(owner)).json();
  assert.equal(first.reports.length, 25);
  assert.equal((await submit(other, draft())).status, 201);
  const second = await (await inbox(owner, '?before=' + first.nextBefore)).json();
  assert.equal(second.nextBefore, null);
  const ids = [...first.reports, ...second.reports].map(r => r.id);
  assert.equal(new Set(ids).size, 27);
  assert.deepEqual(ids, [...ids].sort((a,b) => b - a));
  assert.equal((await inbox(owner, '?before=zero')).status, 400);
  const account = async (path, method, data) => handleApi(new Request(base + path, {
    method, headers: {...student, Origin: base, 'Content-Type': 'application/json'}, body: JSON.stringify(data)
  }), env);
  assert.equal((await account('/api/account/profile', 'POST', {firstName:'Demo', lastName:'Tester', consentCloud:true})).status, 200);
  const exported = await (await account('/api/account/export', 'GET')).json();
  assert.equal(exported.problemReports.length, 8);
  assert.equal((await account('/api/account', 'DELETE', {confirm:'DELETE MY GOPLAN DATA'})).status, 200);
  const remaining = await (await inbox(owner)).json();
  assert.equal(remaining.reports.length, 20);
  assert.ok(remaining.reports.every(r => r.email !== reports[0].email));
} finally {
  DB.close();
}
console.log('Demo reports reach the owner inbox with verified identity, private access, safe retries, rate limits and stable pagination.');
