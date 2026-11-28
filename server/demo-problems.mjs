import {accountIdentity, readJsonBody} from './auth.mjs';
import {privateHeaders} from './admin-auth.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body, status) => Response.json(body, {status, headers: privateHeaders});

export async function submitDemoProblem(request, env) {
  if (request.method !== 'POST') return reply({error: 'Use POST.'}, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return reply({error: 'Send the report from the GoPlan demo.'}, 403);
  }
  try {
    const user = await accountIdentity(request, env);
    if (!user) return reply({error: 'Sign in to GoPlan to send your report.'}, 401);
    const data = await readJsonBody(request, 16_384);
    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    if (typeof data?.requestId !== 'string' || !uuid.test(data.requestId)) {
      return reply({error: 'Reopen the form and try again.'}, 400);
    }
    if (!message || message.length > 2000) {
      return reply({error: 'Describe the problem in 1 to 2,000 characters.'}, 400);
    }

    // One statement enforces the per-account limit even on concurrent submissions.
    const now = Date.now();
    const result = await env.DB.prepare(`
      INSERT INTO demo_problem_reports (user_id, request_id, email, message, created_at)
      SELECT ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM demo_problem_reports WHERE user_id = ? AND created_at > ?) < 8
      ON CONFLICT(user_id, request_id) DO NOTHING
    `).bind(user.id, data.requestId, user.email, message, now, user.id, now - 3_600_000).run();
    if (result.meta.changes) return reply({received: true}, 201);

    const previous = await env.DB.prepare(
      'SELECT message FROM demo_problem_reports WHERE user_id = ? AND request_id = ?'
    ).bind(user.id, data.requestId).first();
    if (!previous) return reply({error: 'You have sent several reports recently. Try again in an hour.'}, 429);
    if (previous.message !== message) return reply({error: 'A different report already used this submission.'}, 409);
    return reply({received: true}, 200);
  } catch (error) {
    return reply({error: error.status ? error.message : 'Could not confirm delivery. Please try again.'}, error.status || 503);
  }
}

export async function listDemoProblems(db, before) {
  if (before !== null && (!/^[1-9]\d*$/.test(before) || !Number.isSafeInteger(Number(before)))) {
    throw Object.assign(Error('Invalid report page.'), {status: 400});
  }
  const pageSize = 25;
  const {results} = await db.prepare(`
    SELECT id, email, message, created_at AS createdAt FROM demo_problem_reports
    WHERE id < ? ORDER BY id DESC LIMIT ?
  `).bind(before === null ? Number.MAX_SAFE_INTEGER : Number(before), pageSize + 1).all();
  const reports = results.slice(0, pageSize);
  return {reports, nextBefore: results.length > pageSize ? reports.at(-1).id : null};
}
