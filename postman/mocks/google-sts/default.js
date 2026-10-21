// Synthetic contract: https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token
// Only artificial tokens; never point real managed identities at this simulation.
const http = require('http');
http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST' || req.url !== '/v1/token') return send(501, {error: 'not_modeled'});
  let body = req.body;
  if (!body) { let raw = ''; for await (const chunk of req) raw += chunk; body = raw; }
  if (typeof body === 'string') body = req.headers['content-type']?.includes('json') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
  if (body.grant_type !== 'urn:ietf:params:oauth:grant-type:token-exchange' ||
      body.requested_token_type !== 'urn:ietf:params:oauth:token-type:access_token' ||
      body.subject_token_type !== 'urn:ietf:params:oauth:token-type:jwt' ||
      body.scope !== 'https://www.googleapis.com/auth/cloud-platform' ||
      body.audience !== '//iam.googleapis.com/projects/930398712637/locations/global/workloadIdentityPools/aiteacher-beta/providers/azure-runtime' ||
      req.headers.authorization) return send(400, {error: 'invalid_request'});
  if (body.subject_token === 'synthetic-denied') return send(400, {error: 'invalid_grant', error_description: 'Synthetic trust rejection'});
  if (body.subject_token === 'synthetic-redirect') { res.writeHead(307, {Location: '/must-not-follow'}); return res.end(); }
  if (body.subject_token === 'synthetic-hang') await new Promise(resolve => setTimeout(resolve, 5000));
  if (!['synthetic-azure-jwt', 'synthetic-hang'].includes(body.subject_token)) return send(400, {error: 'invalid_grant'});
  send(200, {access_token: 'synthetic-google-token', issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', token_type: 'Bearer', expires_in: 3600});
}).listen(process.env.PORT);
