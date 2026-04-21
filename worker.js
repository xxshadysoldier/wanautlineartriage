/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Linear Feedback Worker  —  Cloudflare Worker
 *  Routes:
 *    GET  /labels  →  fetch all issue labels from your Linear workspace
 *    POST /issue   →  create a new issue in triage
 * ─────────────────────────────────────────────────────────────────────────────
 *  Set these in your Worker's Environment Variables (Cloudflare dashboard):
 *    LINEAR_API_KEY  — your Linear personal API key
 *    LINEAR_TEAM_ID  — the ID of the team to create issues in
 *    ALLOWED_ORIGIN  — your GitHub Pages URL, e.g. https://yourname.github.io
 * ─────────────────────────────────────────────────────────────────────────────
 */

const LINEAR_API = 'https://api.linear.app/graphql';

// ── CORS headers ─────────────────────────────────────────────────────────────
function corsHeaders(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '*';
  // Allow exact origin match OR wildcard
  const allowedOrigin = (allowed === '*' || origin === allowed) ? origin || '*' : '';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ── Linear GraphQL helper ─────────────────────────────────────────────────────
async function linearQuery(apiKey, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// ── Handler: GET /labels ──────────────────────────────────────────────────────
async function handleLabels(env) {
  const query = `
    query Labels($teamId: String!) {
      team(id: $teamId) {
        labels {
          nodes { id name color }
        }
      }
    }
  `;
  const data = await linearQuery(env.LINEAR_API_KEY, query, {
    teamId: env.LINEAR_TEAM_ID,
  });

  if (data.errors) {
    return { error: data.errors[0]?.message || 'Linear API error' };
  }

  const labels = data.data?.team?.labels?.nodes || [];
  return { labels };
}

// ── Handler: POST /issue ──────────────────────────────────────────────────────
async function handleCreateIssue(env, body) {
  const { title, description, labelIds = [] } = body;

  if (!title?.trim()) return { error: 'Title is required.' };

  // 1. Find the "Triage" state for this team
  const stateQuery = `
    query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name type } }
      }
    }
  `;
  const stateData = await linearQuery(env.LINEAR_API_KEY, stateQuery, {
    teamId: env.LINEAR_TEAM_ID,
  });

  if (stateData.errors) {
    return { error: stateData.errors[0]?.message || 'Could not fetch team states.' };
  }

  const states = stateData.data?.team?.states?.nodes || [];

  // Look for a state named "Triage" first, then fall back to the first "triage" type state,
  // then fall back to the first "backlog" type, then whatever comes first.
  const triageState =
    states.find(s => s.name.toLowerCase() === 'triage') ||
    states.find(s => s.type === 'triage') ||
    states.find(s => s.type === 'backlog') ||
    states[0];

  if (!triageState) {
    return { error: 'Could not find a triage or backlog state for this team.' };
  }

  // 2. Create the issue
  const createMutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id url title }
      }
    }
  `;

  const input = {
    teamId: env.LINEAR_TEAM_ID,
    stateId: triageState.id,
    title: title.trim(),
    description: description?.trim() || '',
    ...(labelIds.length > 0 ? { labelIds } : {}),
  };

  const issueData = await linearQuery(env.LINEAR_API_KEY, createMutation, { input });

  if (issueData.errors) {
    return { error: issueData.errors[0]?.message || 'Could not create issue.' };
  }

  const issue = issueData.data?.issueCreate?.issue;
  return {
    success: true,
    issueId: issue?.id,
    issueUrl: issue?.url,
    issueTitle: issue?.title,
  };
}

// ── Main fetch handler ────────────────────────────────────────────────────────
export default {
  async fetch(req, env) {
    const cors = corsHeaders(env, req);
    const url = new URL(req.url);

    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Validate env vars
    if (!env.LINEAR_API_KEY || !env.LINEAR_TEAM_ID) {
      return json(
        { error: 'Worker not configured. Set LINEAR_API_KEY and LINEAR_TEAM_ID environment variables.' },
        500,
        cors
      );
    }

    try {
      if (req.method === 'GET' && url.pathname === '/labels') {
        const result = await handleLabels(env);
        return json(result, result.error ? 500 : 200, cors);
      }

      if (req.method === 'POST' && url.pathname === '/issue') {
        const body = await req.json().catch(() => ({}));
        const result = await handleCreateIssue(env, body);
        return json(result, result.error ? 400 : 200, cors);
      }

      return json({ error: 'Not found.' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'Internal server error.' }, 500, cors);
    }
  },
};
