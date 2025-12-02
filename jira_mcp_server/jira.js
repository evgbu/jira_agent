/**
 * Jira REST API client for on-premises/server version
 */

const JIRA_URL = process.env.JIRA_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

function getAuthHeader() {
  if (!JIRA_API_TOKEN) {
    throw new Error('Missing required environment variable: JIRA_API_TOKEN');
  }

  if (JIRA_USERNAME) {
    const credentials = `${JIRA_USERNAME}:${JIRA_API_TOKEN}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return `Basic ${encoded}`;
  } else {
    return `Bearer ${JIRA_API_TOKEN}`;
  }
}

function getConfig() {
  if (!JIRA_URL) {
    const envVars = Object.keys(process.env).map(key => `${key}=${process.env[key]}`).join('\n');
    throw new Error(`Missing required environment variable: JIRA_URL\nAvailable environment variables:\n${envVars}`);
  }

  const baseUrl = JIRA_URL.endsWith('/') ? JIRA_URL.slice(0, -1) : JIRA_URL;
  return { baseUrl, authHeader: getAuthHeader() };
}

export async function getIssue(issueKey, maxComments = 30, offset = 0) {
  const { baseUrl, authHeader } = getConfig();
  const url = `${baseUrl}/rest/api/2/issue/${issueKey}?fields=summary,description,parent`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch issue ${issueKey}: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const fields = data.fields || {};

  // Fetch comments separately with pagination
  const commentsUrl = `${baseUrl}/rest/api/2/issue/${issueKey}/comment?startAt=${offset}&maxResults=${maxComments}`;
  const commentsResponse = await fetch(commentsUrl, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  if (!commentsResponse.ok) {
    const errorText = await commentsResponse.text();
    throw new Error(`Failed to fetch comments for ${issueKey}: ${commentsResponse.status} ${commentsResponse.statusText} - ${errorText}`);
  }

  const commentsData = await commentsResponse.json();
  const comments = (commentsData.comments || []).map(comment => ({
    author: comment.author?.displayName || comment.author?.name || 'Unknown',
    body: comment.body || '',
    created: comment.created || ''
  }));

  const totalComments = commentsData.total || comments.length;

  return {
    title: fields.summary || '',
    description: fields.description || '',
    parent: fields.parent ? { key: fields.parent.key } : null,
    comments: comments,
    totalComments: totalComments
  };
}

export async function addComment(issueKey, body) {
  const { baseUrl, authHeader } = getConfig();
  const url = `${baseUrl}/rest/api/2/issue/${issueKey}/comment`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to add comment to ${issueKey}: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();

  return {
    success: true,
    commentId: data.id || ''
  };
}
