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

async function fetchWithRetry(url, options, maxRetries = 3, retryDelay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If request succeeds or fails with a non-retryable error, return the response
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 406)) {
        return response;
      }

      // For 5xx errors or 406, retry
      if (attempt < maxRetries) {
        const errorText = await response.text();
        console.error(`Attempt ${attempt}/${maxRetries} failed: ${response.status} ${response.statusText} - ${errorText}. Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      // Last attempt, return the response (will be handled by caller)
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.error(`Attempt ${attempt}/${maxRetries} failed with error: ${error.message}. Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // If we exhausted all retries with exceptions, throw the last error
  throw lastError;
}

export async function getIssue(issueKey, maxComments = 30, offset = 0) {
  const { baseUrl, authHeader } = getConfig();

  const issueRequestUrl = `${baseUrl}/issue/${issueKey}?fields=summary,description,parent`;
  const issueResponse = await fetchWithRetry(issueRequestUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'User-Agent': 'Jira-MCP-Client/1.0'
    }
  });

  if (!issueResponse.ok) {
    const errorText = await issueResponse.text();
    throw new Error(`Failed to fetch issue ${issueKey}: ${issueResponse.status} ${issueResponse.statusText} - ${errorText}`);
  }

  const data = await issueResponse.json();
  const fields = data.fields || {};

  // Fetch comments separately with pagination
  const commentsRequestUrl = `${baseUrl}/issue/${issueKey}/comment?startAt=${offset}&maxResults=${maxComments}`;
  const commentsResponse = await fetchWithRetry(commentsRequestUrl, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json',
      'User-Agent': 'Jira-MCP-Client/1.0'
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
  const url = `${baseUrl}/issue/${issueKey}/comment`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Jira-MCP-Client/1.0'
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
