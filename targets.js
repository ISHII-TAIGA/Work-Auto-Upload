// ===============================
// 選んだものの管理（アップロード対象を決める部分）
// ===============================

// 選んだものを覚えておく箱
let looseFiles = [];  //「ファイルを選択」で追加したもの
let folderGroups = [];



// ===============================
// 関数定義
// ===============================

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