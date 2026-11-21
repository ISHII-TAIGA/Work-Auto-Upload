// ===============================
// 変数宣言
// ===============================
let repoUrl;
let token;
let files;
let result;


// ===============================
// 関数宣言
// ===============================
// ファイルパスをURL用にエンコードする関数
function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

// ファイルを base64 文字列に変換する関数
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// GitHub にファイルをアップロードする関数
async function uploadFile(owner, repo, path, content, token, sha = null) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}`;

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

// 既存ファイルの SHA を取得
async function getFileSha(owner, repo, path, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}`;

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

// リポジトリURLから owner と repo を取り出す関数
function parseRepoUrl(url) {
  const m = url.trim().match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

// エラーメッセージを受け取る関数
async function errorMessage(res) {
  try {
    const data = await res.json();
    return `${res.status} ${data.message || res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

// 指定ミリ秒だけ待つ関数
const sleep = (ms) => new Promise((r) => setTimeout(r,ms));

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

// ===============================
// メイン処理（アップロードボタン）
// ===============================
document.getElementById("uploadBtn").addEventListener("click", async () => {

  // ← 値の取得はここで行う（クリック時）
  repoUrl = document.getElementById("repoUrl").value;
  token = document.getElementById("token").value.trim();
  files = document.getElementById("folderInput").files;
  result = document.getElementById("result");

  if (!repoUrl || !token || files.length === 0) {
    result.innerText = "リポジトリURL・Token・フォルダを確認してください。";
    return;
  }

  const repoInfo = parseRepoUrl(repoUrl);
  if(!repoInfo) {
    result.innerText = "リポジトリURLの形式が正しくありません。例: https://github.com/USER/REPO";
    return;
  }
  const { owner, repo } = repoInfo;

  const failed = [];   // 失敗したファイルを入れる箱
  let done = 0;        // 成功した数

  const btn = document.getElementById("uploadBtn");
  btn.disabled = true;

  result.innerText = "アップロード中…";

  try {
    for (const file of files) {
      const parts = file.webkitRelativePath.split("/");
      if (parts.includes(".git")) continue;
      const path = parts.slice(1).join("/");

      result.innerText = `アップロード中… ${path}`;   // 今どのファイルか分かるように

      try {
        const content = await fileToBase64(file);
        await uploadWithSha(owner, repo, path, content, token);
        done++;   // ここまで来たら成功
      } catch (e) {
        failed.push(`${path}: ${e.message}`);   // 失敗を記録して、次のファイルへ
        // トークンが無効(401)なら、続けても全部失敗するのでここで止める
        if (e.status === 401) break;
      }

      await sleep(500);
    }
  } finally {
    btn.disabled = false;
  }

  const lines = [`成功: ${done} ファイル`];
  if (failed.length) lines.push("", `失敗 ${failed.length} 件:`, ...failed);
  result.innerText = lines.join("\n");
  result.style.whiteSpace = "pre-wrap";
});