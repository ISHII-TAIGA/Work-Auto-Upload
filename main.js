// ===============================
// 要素の取得
// ===============================
const repoUrlInput = document.getElementById("repoUrl");
const tokenInput = document.getElementById("token");
const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const pickFolderBtn = document.getElementById("pickFolderBtn");
const pickFilesBtn = document.getElementById("pickFilesBtn");
const uploadBtn = document.getElementById("uploadBtn");
const resultDiv = document.getElementById("result");

const clearBtn = document.getElementById("clearBtn");
const fileCountP = document.getElementById("fileCount");
const fileListUl = document.getElementById("fileList");
const uploadedListUl = document.getElementById("uploadedList");

const warningP = document.getElementById("duplicateWarning");


// ===============================
// 変数宣言
// ===============================
let looseFiles = [];  //「ファイルを選択」で追加したもの
let folderGroups = [];


// ===============================
// 設定
// ===============================
const API_BASE = "https://api.github.com";  // GitHub API の入り口
const WAIT_BETWEEN_FILES_MS = 500;          // 1ファイルごとの待ち時間（ミリ秒）

// フォルダ選択のとき、自動で除外する名前（フォルダ名・ファイル名）
const EXCLUDED_NAMES = [
  ".git", 
  "node_modules", 
  ".DS_Store", 
  "Thumbs.db"
];


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

// フォルダ1つ分から、アップロード対象を作る関数
// 除外リスト（EXCLUDED_NAMES）にある名前を含むものは、対象外にする
function getFolderTargets(group) {
  const targets = [];
  for (const file of group.files) {
    const parts = file.webkitRelativePath.split("/");
    if (parts.some((p) => EXCLUDED_NAMES.includes(p))) continue;
    const path = group.stripName ? parts.slice(1).join("/") : parts.join("/");
    if (!path) continue;
    targets.push({ file, path });
  }
  return targets;
}

// アップロード対象を全部まとめて返す関数
function getAllTargets() {
  const folderTargets = folderGroups.flatMap(getFolderTargets); 
  return [...looseFiles, ...folderTargets];
}

// 同じパスが2回以上出てくるものを探す関数
function findDuplicatePaths(targets) {
  const seen = new Set();
  const dups = new Set();
  for (const { path } of targets) {
    if (seen.has(path)) dups.add(path);
    seen.add(path);
  }
  return [...dups];
}

// かぶりの警告を画面に表示する関数
function renderDuplicateWarning() {
  const dups = findDuplicatePaths(getAllTargets());
  warningP.textContent = dups.length
   ? `⚠ 同じ場所に上がるファイルが重なっています: ${dups.join(", ")}`
    : "";
}

// 「×」ボタンを作る関数
function createRemoveButton(onRemove) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "remove";
  btn.textContent = "×";
  btn.title = "アップロード対象から外す";
  btn.addEventListener("click", () => {
    if (uploadBtn.disabled) return;
    onRemove();
  });
  return btn;
}

// 選択中のフォルダ・ファイル一覧を画面に表示する関数
function renderFileList() {
  fileListUl.innerHTML = "";  // まず一覧を空にする
  renderDuplicateWarning();   // 警告を更新する(何も選んでいないときは、消える)

  const total = getAllTargets().length;
  if (total === 0) {
    // 何も選んでいないなら空に、選んだが対象がないなら理由を出す
    const nothingSelected = looseFiles.length === 0 && folderGroups.length === 0;
    fileCountP.textContent = nothingSelected ? "" : "アップロード対象のファイルがありません"
    return;
  }

  fileCountP.textContent = `${total} ファイルが選択されています`;

  // 1．「ファイルを選択」で追加したもの
  for (const item of looseFiles) {
    const li = document.createElement("li");
    li.append(`${item.path} `);
    li.appendChild(createRemoveButton(() => {
      looseFiles =looseFiles.filter((t) => t !== item);
      renderFileList();
    }));
    fileListUl.appendChild(li); 
  }

  // 2．「フォルダを選択」で追加したもの
  for (const group of folderGroups) {
    const targets = getFolderTargets(group);  // .git 除外などのルールは、アップロードと同じ
    if (targets.length === 0) continue;

    const li = document.createElement("li");

    // フォルダ名
    const nameSpan = document.createElement("span");
    nameSpan.textContent = `📁 ${group.name}`;
    nameSpan.classList.toggle("faded", group.stripName);
    li.appendChild(nameSpan);

    // 先頭のフォルダ名削除・非削除切り替えボタン
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "toggle";
    toggleBtn.classList.toggle("on", group.stripName);    // ON のときだけ色を変える
    toggleBtn.textContent = group.stripName ? "フォルダ名を外す: ON" : "フォルダ名を外す: OFF";
    toggleBtn.title = "ON にすると、フォルダの中身がフォルダ名なしで上がります";
    toggleBtn.addEventListener("click", () => {
      if (uploadBtn.disabled) return;          // アップロード中は切り替えない
      group.stripName = !group.stripName;      // ON / OFF を逆にする
      renderFileList();                        // 一覧を作り直す
    });
    li.appendChild(toggleBtn);

    // フォルダごと外す「×」
    li.appendChild(createRemoveButton(() => {
      folderGroups = folderGroups.filter((g) => g !== group);
      renderFileList();
    }));

    // 実際にどこに上がるかの説明（1つ目のファイルを例に出す）
    /*
    const note = document.createElement("div");
    note.className = "folder-note";
    note.textContent = group.stripName
      ? `→ 中身が一番上に上がります（例: ${targets[0].path}）`
      : `→ 「${group.name}」フォルダの中に上がります（例: ${targets[0].path}）`;
    li.appendChild(note);
    */

    // フォルダの中身
    const childUl = document.createElement("ul");
    childUl.classList.toggle("faded", !group.stripName);
    for (const { file } of targets) {
      const childLi = document.createElement("li");
      childLi.append(`${file.webkitRelativePath.split("/").slice(1).join("/")} `);
      childLi.appendChild(createRemoveButton(() => {
        group.files = group.files.filter((f) => f !== file);   // このファイルだけ取り除く
        if (getFolderTargets(group).length === 0) {            // 中身が全部なくなったら
          folderGroups = folderGroups.filter((g) => g !== group);   // フォルダごと消す
        }
        renderFileList();
      }));
      childUl.appendChild(childLi);
    }
    li.appendChild(childUl);
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

// フォルダが選ばれたら、箱に追加して一覧を更新する
folderInput.addEventListener("change", () => {
  const files = Array.from(folderInput.files);
  if (files.length === 0) return;

  const name = files[0].webkitRelativePath.split("/")[0];

  folderGroups = folderGroups.filter((g) => g.name !== name);
  folderGroups.push({ name, files, stripName: false});

  folderInput.value = "";
  renderFileList();
});

// ファイルが選ばれたら箱に追加
fileInput.addEventListener("change", () => {
  for (const file of fileInput.files) {
    looseFiles = looseFiles.filter((t) => t.path !== file.name);
    looseFiles.push({ file, path: file.name});
  }
  fileInput.value = "";
  renderFileList();
});

// ボタンを押したら、隠してある本物の選択欄を開く
pickFilesBtn.addEventListener("click", () => fileInput.click());
pickFolderBtn.addEventListener("click", () => folderInput.click());

// エラーメッセージを作る関数
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
  const targets = getAllTargets();

  if (!repoUrl || !token || targets.length === 0) {
    resultDiv.innerText = "リポジトリURL・Token・ファイルを確認してください。";
    return;
  }

  const repoInfo = parseRepoUrl(repoUrl);
  if(!repoInfo) {
    resultDiv.innerText = "リポジトリURLの形式が正しくありません。例: https://github.com/USER/REPO";
    return;
  }
  const { owner, repo } = repoInfo;

  const dups = findDuplicatePaths(targets);
  if (dups.length > 0) {
    resultDiv.innerText =
      "同じ場所に上がるファイルが重なっているため、アップロードを止めました。\n" +
      "フォルダ名を外す設定を切り替えるか、選び直してください。\n\n" +
      dups.join("\n");
    resultDiv.style.whiteSpace = "pre-wrap";
    return;
  }

  const failed = [];     // 失敗したファイルを入れる箱
  const succeeded = [];  // 成功したファイルのパスを入れる箱
  let done = 0;          // 成功した数

  renderUploadedList([]);  // 前回の一覧を消す
  uploadBtn.disabled = true;
  clearBtn.disabled = true;
  pickFilesBtn.disabled = true;
  pickFolderBtn.disabled = true;
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
    pickFilesBtn.disabled = false;
    pickFolderBtn.disabled = false;
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
  fileInput.value = "";
  looseFiles = [];
  folderGroups = [];
  renderFileList();          // 一覧も空にする
  renderUploadedList([]);
  resultDiv.innerText = "";  // 前回のアップロード結果も消す
})