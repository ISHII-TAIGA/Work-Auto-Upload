// 指定ミリ秒だけ待つ関数
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// リポジトリURLから owner と repo を取り出す関数
function parseRepoUrl(url) {
  const m = url.trim().match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

// エラーメッセージを作る関数
async function errorMessage(res) {
  try {
    const data = await res.json();
    return `${res.status} ${data.message || res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}