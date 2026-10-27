type FileSystemEntryLike = FileSystemEntry & {
  fullPath: string;
};

type FileSystemFileEntryLike = FileSystemFileEntry & FileSystemEntryLike;
type FileSystemDirectoryEntryLike = FileSystemDirectoryEntry & FileSystemEntryLike;

type DataTransferItemWithEntry = DataTransferItem & {
  getAsEntry?: () => FileSystemEntryLike | null;
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

const fileIgnoreList = new Set([
  ".gitignore",
  "README.md",
  ".DS_Store",
]);

const dirIgnoreList = new Set([
  ".git",
  "node_modules",
]);

export let allDroppedFiles: FileSystemFileEntryLike[] = [];

document.addEventListener("dragover", (ev) => {
  ev.preventDefault();
});

document.addEventListener("drop", (ev) => {
  ev.preventDefault();
  void handleDrop(ev);
});

async function handleDrop(ev: DragEvent) {
  const transfer = ev.dataTransfer;
  if (!transfer) return;

  const entries = getDroppedEntries(transfer);
  if (entries.length) {
    await handleFilesystemEntries(entries);
    return;
  }

  allDroppedFiles = Array.from(transfer.files).map(fileToEntry);
}

function getDroppedEntries(transfer: DataTransfer): FileSystemEntryLike[] {
  const entries: FileSystemEntryLike[] = [];
  for (const item of Array.from(transfer.items) as DataTransferItemWithEntry[]) {
    const entry = item.getAsEntry?.() ?? item.webkitGetAsEntry?.() ?? null;
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

async function handleFilesystemEntries(entries: FileSystemEntryLike[]) {
  const allFiles: FileSystemFileEntryLike[] = [];

  for (const entry of entries) {
    if (entry.isFile) {
      if (!fileIgnoreList.has(entry.name)) {
        allFiles.push(entry as FileSystemFileEntryLike);
      }
      continue;
    }

    if (entry.isDirectory && !dirIgnoreList.has(entry.name)) {
      const files = await readDirectory(entry as FileSystemDirectoryEntryLike);
      for (const file of files) {
        if (!fileIgnoreList.has(file.name)) {
          allFiles.push(file);
        }
      }
    }
  }

  allFiles.sort((a, b) => {
    const diff = a.fullPath.split("/").length - b.fullPath.split("/").length;
    return diff !== 0 ? diff : a.fullPath.localeCompare(b.fullPath);
  });

  allDroppedFiles = allFiles;
}

async function readDirectory(directory: FileSystemDirectoryEntryLike): Promise<FileSystemFileEntryLike[]> {
  const files: FileSystemFileEntryLike[] = [];

  async function visit(dir: FileSystemDirectoryEntry): Promise<void> {
    const reader = dir.createReader();
    for (;;) {
      const entries = await readEntries(reader);
      if (!entries.length) return;

      for (const entry of entries) {
        if (entry.isDirectory) {
          if (!dirIgnoreList.has(entry.name)) {
            await visit(entry as FileSystemDirectoryEntry);
          }
        }
        else if (entry.isFile) {
          files.push(entry as FileSystemFileEntryLike);
        }
      }
    }
  }

  await visit(directory);
  return files;
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(
      entries => resolve(entries as FileSystemEntryLike[]),
      reject,
    );
  });
}

function fileToEntry(file: File): FileSystemFileEntryLike {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    fullPath: `/${file.name}`,
    filesystem: undefined as unknown as FileSystem,
    getParent: (_successCallback, errorCallback) => {
      errorCallback?.(new DOMException("Dropped File objects do not expose parents."));
    },
    file: (successCallback) => successCallback(file),
  };
}
