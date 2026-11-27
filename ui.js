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