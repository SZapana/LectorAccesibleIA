const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const raiz = 'D:\\UNAP\\SEMESTRE VII\\INTERACCIÓN HUMANO COMPUTADOR\\UNIDAD II\\02 - PRÁCTICAS Y TAREAS\\LectorAccesibleIA';
const origen = path.join(raiz, 'extension');
const dist = path.join(raiz, 'dist');

const manifest = JSON.parse(fs.readFileSync(path.join(origen, 'manifest.json'), 'utf8'));
const version = manifest.version;

// Limpia artefactos de empaquetados anteriores (evita carpetas anidadas viejas).
// fs.rmSync con recursive:true no borra de forma fiable en la unidad D:
// por eso se borra archivo por archivo y luego el directorio vacio.
function cleanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanDir(full);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
}

fs.mkdirSync(dist, { recursive: true });
cleanDir(dist);

const zipPath = path.join(dist, `LectorAccesibleIA-${version}.zip`);
const output = fs.createWriteStream(zipPath);
const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

output.on('close', () => {
  console.log(`ZIP: ${zipPath}`);
  console.log(`version ${version} - ${archive.pointer()} bytes`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);

// Recursive directory traversal
function addDir(dirPath, basePath) {
  fs.readdirSync(dirPath, { withFileTypes: true }).forEach(dirent => {
    const fullPath = path.join(dirPath, dirent.name);
    const relPath = basePath
      ? path.join(basePath, dirent.name).replace(/\\/g, '/')
      : dirent.name;
    if (dirent.isDirectory()) {
      addDir(fullPath, relPath);
    } else {
      archive.file(fullPath, { name: relPath });
    }
  });
}

addDir(origen, null);

// Instrucciones y lanzador del proxy viven en disco: se editan sin tocar JS.
archive.file(path.join(raiz, 'docs', 'COMO-INSTALAR.txt'), { name: 'COMO-INSTALAR.txt' });
archive.file(path.join(raiz, 'tools', 'INICIAR-PROXY.bat'), { name: 'INICIAR-PROXY.bat' });

archive.finalize();
