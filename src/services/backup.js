import fs from 'node:fs/promises';
import path from 'node:path';
export async function backupMatched(sqlite,uploadDir,destination) {
  const directory=path.resolve(destination);const uploads=path.resolve(uploadDir);
  if(directory===uploads || directory.startsWith(uploads+path.sep))throw new Error('Backup destination must be outside uploads.');
  // Caller must stop all application writers for the full DB + files operation.
  await fs.mkdir(directory,{recursive:false});
  await sqlite.backup(path.join(directory,'kitchen.sqlite'));
  const exists=await fs.stat(uploads).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(exists && !exists.isDirectory())throw new Error('Upload path must be a directory.');
  if(exists)await fs.cp(uploads,path.join(directory,'uploads'),{recursive:true,errorOnExist:true});
  else await fs.mkdir(path.join(directory,'uploads'));
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({completedAt:new Date().toISOString(),database:'kitchen.sqlite',uploads:'uploads'},null,2));
  return directory;
}
