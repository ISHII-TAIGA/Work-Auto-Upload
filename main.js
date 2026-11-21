// ===============================
// 要素の取得
// ===============================
const repoUrlInput = document.getElementById("repoUrl");
const tokenInput = document.getElementById("token");
const folderInput = document.getElementById("folderInput");
const uploadBtn = document.getElementById("uploadBtn");
const resultDiv = document.getElementById("result");

const clearBtn = document.getElementById("clearBtn");
const fileCountP = document.getElementById("fileCount");
const fileListUl = document.getElementById("fileList");
const uploadedListUl = document.getElementById("uploadedList");


// ===============================
// 設定
// ===============================
const API_BASE = "https://api.github.com";  // GitHub API の入り口
const WAIT_BETWEEN_FILES_MS = 500;          // 1ファイルごとの待ち時間（ミリ秒）


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

// リポジトリURLから owner と repo を取り出す関数
function parseRepoUrl(url) {
  const m = url.trim().match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

// アップロード対象のファイルを選ぶ関数
function getTargets(files) {
  const targets = [];
  for (const file of files) {
    const parts = file.webkitRelativePath.split("/");
    if (parts.includes(".git")) continue;
    const path = parts.slice(1).join("/");
    if (!path) continue;
    targets.push({ file, path });
  }
  return targets;
}

// 選択中のファイル一覧を画面に表示する関数
function renderFileList() {
  fileListUl.innerHTML = "";  // まず一覧を空にする

  const files = folderInput.files;
  if (files.length === 0) {
    fileCountP.textContent = "";
    return;
  }

  const targets = getTargets(files)
  if (targets.length === 0) {
    fileCountP.textContent = "アップロード対象のファイルがありません。";
    return;
  }

  fileCountP.textContent = `${targets.length} ファイルが選択されています`;

  for (const { path } of targets) {
    const li = document.createElement("li");
    li.textContent = path;
    fileListUl.appendChild(li);
  }
}

// アップロード成功したファイルを一覧に表示する関数
function renderUploadedList(paths) {
  uploadedListUl.innerHTML = "";  // まず一覧を空にする

  for (const path of paths) {
    const li = document.createElement("li");
    li.textContent = path;
    uploadedListUl.appendChild(li);
  }
}

// フォルダが選ばれたら、一覧を更新する
folderInput.addEventListener("change", renderFileList);

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
uploadBtn.addEventListener("click", async () => {

  // クリックした時点の入力値を取る（この関数の中だけで使う）
  const repoUrl = repoUrlInput.value;
  const token = tokenInput.value.trim();
  const files = folderInput.files;

  if (!repoUrl || !token || files.length === 0) {
    resultDiv.innerText = "リポジトリURL・Token・フォルダを確認してください。";
    return;
  }

  const repoInfo = parseRepoUrl(repoUrl);
  if(!repoInfo) {
    resultDiv.innerText = "リポジトリURLの形式が正しくありません。例: https://github.com/USER/REPO";
    return;
  }
  const { owner, repo } = repoInfo;

  const targets = getTargets(files);
  if (targets.length === 0) {
    resultDiv.innerText = "アップロード対象のファイルがありません。";
    return;
  }

  const failed = [];     // 失敗したファイルを入れる箱
  const succeeded = [];  // 成功したファイルのパスを入れる箱
  let done = 0;          // 成功した数

  renderUploadedList([]);  // 前回の一覧を消す
  uploadBtn.disabled = true;
  clearBtn.disabled = true;
  resultDiv.innerText = "アップロード中…";

  try {
    for (const { file, path } of targets) {
      resultDiv.innerText = `アップロード中… (${done + failed.length + 1}/${targets.length}) ${path}`;

      try {
        const content = await fileToBase64(file);
        await uploadWithSha(owner, repo, path, content, token);
        done++;
        succeeded.push(path);
      } catch (e) {
        failed.push(`${path}: ${e.message}`);
        // トークンが無効(401)なら、続けても全部失敗するのでここで止める
        if (e.status === 401) break;
      }

      await sleep(WAIT_BETWEEN_FILES_MS);
    }
  } finally {
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
  }

  const lines = [`成功: ${done} / ${targets.length} ファイル`];
  if (failed.length) lines.push("", `失敗 ${failed.length} 件:`, ...failed);
  resultDiv.innerText = lines.join("\n");
  resultDiv.style.whiteSpace = "pre-wrap";
  renderUploadedList(succeeded);
});

// 選択解除ボタン
clearBtn.addEventListener("click", () => {
  folderInput.value = "";    // 選択したファイルを全部解除する
  renderFileList();          // 一覧も空にする
  renderUploadedList([]);
  resultDiv.innerText = "";  // 前回のアップロード結果も消す
})