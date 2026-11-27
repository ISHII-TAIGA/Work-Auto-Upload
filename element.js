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