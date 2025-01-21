document.addEventListener("dragover", function (ev) {
	ev.preventDefault();
});

document.addEventListener("drop", function (ev) {
	ev.preventDefault();

    if (ev.dataTransfer?.items)
    {
        /** @type {FileSystemEntry[]} */
        const allEntries = [];

        let haveGetAsFileSystemHandle = false;
        let haveGetAsEntry = false;
        if (ev.dataTransfer.items.length > 0) {
          haveGetAsEntry = ("getAsEntry" in ev.dataTransfer.items[0]) || ("webkitGetAsEntry" in ev.dataTransfer.items[0]);
          haveGetAsFileSystemHandle = ("getAsFileSystemHandle" in ev.dataTransfer.items[0]);
        }

        /*
        async function* getFilesRecursively(entry) {
          if (entry.kind === "file") {
            const file = await entry.getFile();
            if (file !== null) {
              file.relativePath = getRelativePath(entry);
              yield file;
            }
          } else if (entry.kind === "directory") {
            for await (const handle of entry.values()) {
              yield* getFilesRecursively(handle);
            }
          }
        }

        if (haveGetAsFileSystemHandle) {
          for (var i = 0; i < ev.dataTransfer.items.length; i++)
          {
              let item = ev.dataTransfer.items[i];
              let handle = item.getAsFileSystemHandle();
              allEntries.push(handle);
          }
          handleFilesystemEntries(allEntries);
          return;
        }
        */

        if (haveGetAsEntry) {
          for (var i = 0; i < ev.dataTransfer.items.length; i++)
          {
              let item = ev.dataTransfer.items[i];
              /** @type {FileSystemEntry} */
              let entry = ("getAsEntry" in item) ? item.getAsEntry() : item.webkitGetAsEntry();
              allEntries.push(entry);
          }
          handleFilesystemEntries(allEntries);
          return;
        }

        for (var i = 0; i < ev.dataTransfer.items.length; i++)
        {
          let item = ev.dataTransfer.items[i];
          
          // API when there's no "getAsEntry" support
          console.log(item.kind, item, entry);
          if (item.kind === 'file')
          {
              var file = item.getAsFile();
              testAndLoadFile(file);
          }
          // could also be a directory
          else if (item.kind === 'directory')
          {
              var dirReader = item.createReader();
              dirReader.readEntries(function(entries) {
                  for (var i = 0; i < entries.length; i++) {
                      console.log(entries[i].name);
                      var entry = entries[i];
                      if (entry.isFile) {
                          entry.file(function(file) {
                              testAndLoadFile(file);
                          });
                      }
                  }
              });
          }
        }
    } else {
        for (var i = 0; i < ev.dataTransfer.files.length; i++) {
            let file = ev.dataTransfer.files[i];
            testAndLoadFile(file);
        }
    }
});

/**
 * @param {FileSystemEntry[]} entries
 */
async function handleFilesystemEntries(entries) {
    /** @type {FileSystemEntry[]} */
    const allFiles = [];
    const fileIgnoreList = [
      '.gitignore',
      'README.md',
      '.DS_Store',
    ]
    const dirIgnoreList = [
      '.git',
      'node_modules',
    ]
    const debugFileHandling = false;
  
    for (let entry of entries) {
      if (debugFileHandling) console.log("file entry", entry)
      if (entry.isFile) {
        if (debugFileHandling) console.log("single file", entry);
        if (fileIgnoreList.includes(entry.name)) {
          continue;
        }
        allFiles.push(entry);
      }
      else if (entry.isDirectory) {
        if (dirIgnoreList.includes(entry.name)) {
          continue;
        }
        const files = await readDirectory(entry);
        if (debugFileHandling) console.log("all files", files);
        for (const file of files) {
          if (fileIgnoreList.includes(file.name)) {
            continue;
          }
          allFiles.push(file);
        }
      }
    }
  
    // determine which of these is likely the root file
    let rootFileCandidates = [];
    let usdaCandidates = [];
    
    // sort so shorter paths come first
    allFiles.sort((a, b) => {
      const diff = a.fullPath.split('/').length - b.fullPath.split('/').length;
      if (diff !== 0) return diff;
      return a.fullPath.localeCompare(b.fullPath);
    });
  
    // console.log("path candidates", allFiles);
  
    for (const file of allFiles) {
      let ext = file.name.split('.').pop();
      if(ext == 'usd' || ext == 'usdz' || ext == 'usda' || ext == 'usdc') {
        rootFileCandidates.push(file);
      }
      if(ext == 'usda') {
        usdaCandidates.push(file);
      }
    }
  
    let rootFile = undefined;
  
    // if there's multiple, use the first usda
    if (rootFileCandidates.length > 1) {
      if (usdaCandidates.length > 0) {
        rootFile = usdaCandidates[0];
      }
      else {
        rootFile = rootFileCandidates[0];
      }
    }
    else {
      // find the first usda file
      for (const file of allFiles) {
        let ext = file.name.split('.').pop();
        if(ext == 'usda' || ext == 'usdc' || ext == 'usdz' || ext == 'usd') {
          rootFile = file;
          break;
        }
      }
    }
  
    if (!rootFile && allFiles.length > 0) {
      // use first file
      rootFile = allFiles[0];
    }
  
    // TODO if there are still multiple candidates we should ask the user which one to use
    console.log("Assuming this is the root file: " + rootFile?.name); // + ". Total: " + allFiles.length, allFiles.map(f => f.fullPath).join('\n'));
  
  
    async function getFile(fileEntry) {
      try {
        return new Promise((resolve, reject) => fileEntry.file(resolve, reject));
      } catch (err) {
        console.log(err);
      }
    }
  
    console.log("All files", allFiles);

    allDroppedFiles = allFiles;
  
    return;
  }

  /**
 * @param {FileSystemDirectoryEntry} directory
 */
async function readDirectory(directory) {
    let entries = [];
  
    let getAllDirectoryEntries = async (dirReader) => {
      let entries = [];
      let readEntries = async () => {
        let result = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
        if (result.length === 0)
          return entries;
        else
          return entries.concat(result, await readEntries());
      }
      return await readEntries();
    }
  
    /**
     * @param {FileSystemDirectoryReader} dirReader
     * @param {FileSystemDirectoryEntry} directory
     * @returns {Promise<number>}
     */
    let getEntries = async (directory) => {
      let dirReader = directory.createReader();
      await new Promise(async (resolve, reject) => {
        // Call the reader.readEntries() until no more results are returned.
  
          const results = await getAllDirectoryEntries(dirReader);
  
          if (results.length) {
            // entries = entries.concat(results);
            for (let entry of results) {
              if (entry.isDirectory) {
                const foundFiles = await getEntries(entry);
                if (foundFiles === 100)
                  console.warn("Found more than 100 files in directory", entry);
              }
              else {
                entries.push(entry);
              }
            }
          }
          resolve(results.length);
      });
    };
  
    await getEntries(directory);
    return entries;
}

export let allDroppedFiles: FileSystemFileEntry[] = [];
