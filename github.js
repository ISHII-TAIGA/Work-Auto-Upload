// ===============================
// GitHub API とのやり取り
// ===============================

// GitHub API にリクエストを送る関数
async function githubRequest(method, url, token, body) {
  for (let attempt = 1; ;attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    //レート制限かどうかの判定
    const limited =
    res.status === 429 ||
    (res.status === 403 &&
      (res.headers.get("retry-after") || res.headers.get("x-ratelimit-remaining") === "0"));
    
    if (limited && attempt < 3) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep((retryAfter > 0 ? retryAfter : 5 * attempt) * 1000);
      continue; // 少し待ってからもう一度
    }
    return res;
  }
}

// 既存ファイルの SHA を取得
async function getFileSha(owner, repo, path, token) {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(path)}`;

  const res = await githubRequest("GET", url, token);

  if (res.status === 404) return null;

  if (!res.ok) {
    const err = new Error(await errorMessage(res));
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  if (Array.isArray(data)) {
    throw new Error("同名のフォルダがリポジトリに存在します");
  }

  return data.sha;
}

// GitHub にファイルをアップロードする関数
async function uploadFile(owner, repo, path, content, token, sha = null) {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(path)}`;

  const body = {
    message: sha ? `update: ${path}` : `add: ${path}`,
    content: content
  };

  if (sha) {
    body.sha = sha;
  }

  const res = await githubRequest("PUT", url, token, body);

  if (!res.ok) {
    const err = new Error(await errorMessage(res));
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// SHA取得 → アップロード を1セットでやる関数
async function uploadWithSha(owner, repo, path, content, token) {
  let sha = await getFileSha(owner, repo, path, token);
  try {
    return await uploadFile(owner, repo, path, content, token, sha);
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      sha = await getFileSha(owner, repo, path, token);
      return await uploadFile(owner, repo, path, content, token, sha);
    }
    throw e;
  }
}