// ===============================
// 設定
// ===============================
const API_BASE = "https://api.github.com";  // GitHub API の入り口
const WAIT_BETWEEN_FILES_MS = 500;          // 1ファイルごとの待ち時間（ミリ秒）

// フォルダ選択のとき、自動で除外する名前（フォルダ名・ファイル名を随時たす）
const EXCLUDED_NAMES = [
  ".git", 
  "node_modules", 
  ".DS_Store", 
  "Thumbs.db"
];