// ===============================
// 変数宣言（上にまとめる）
// ===============================
let repoUrl;
let token;
let files;
let result;

// ===============================
// GitHub にファイルをアップロードする関数
// ===============================
async function uploadFile(owner, repo, path, content, token, sha = null) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const body = {
    message: sha ? `update: ${path}` : "first commit",
    content: btoa(unescape(encodeURIComponent(content)))
  };

  if (sha) {
    body.sha = sha;
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return res.json();
}

// ===============================
// 既存ファイルの SHA を取得
// ===============================
async function getFileSha(owner, repo, path, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const res = await fetch(url, {
    headers: { "Authorization": `token ${token}` }
  });

  if (res.status === 404) return null;
  const data = await res.json();
  return data.sha;
}

// ===============================
// リポジトリURL → owner / repo 抽出
// ===============================
function parseRepoUrl(url) {
  const cleanUrl = url.replace(/\/$/, ""); // 末尾の / を削除
  const match = cleanUrl.match(/github\.com\/(.+?)\/(.+?)(\.git)?$/);
  return { owner: match[1], repo: match[2] };
}

// ===============================
// メイン処理（アップロードボタン）
// ===============================
document.getElementById("uploadBtn").addEventListener("click", async () => {

  // ← 値の取得はここで行う（クリック時）
  repoUrl = document.getElementById("repoUrl").value;
  token = document.getElementById("token").value;
  files = document.getElementById("folderInput").files;
  result = document.getElementById("result");

  if (!repoUrl || !token || files.length === 0) {
    result.innerText = "リポジトリURL・Token・フォルダを確認してください。";
    return;
  }

  const { owner, repo } = parseRepoUrl(repoUrl);

  result.innerText = "アップロード中…";

  for (const file of files) {

    // .git フォルダを完全に除外
    if (file.webkitRelativePath.includes(".git")) {
        continue;
    }
    
    const path = file.webkitRelativePath.split("/").slice(1).join("/");
    const content = await file.text();

    const sha = await getFileSha(owner, repo, path, token);

    await uploadFile(owner, repo, path, content, token, sha);

    // GitHub API の負荷軽減（大量ファイル時に安定）
    await new Promise(r => setTimeout(r, 150));
  }

  result.innerText = "アップロード完了！";
  alert("アップロードが完了しました！");
});