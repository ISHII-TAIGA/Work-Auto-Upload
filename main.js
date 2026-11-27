// ===============================
// 関数宣言
// ===============================


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