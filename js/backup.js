// Copia de seguridad automática en Google Drive (como mucho una vez cada 12 horas).
import { db, update, exportJSON, importJSON } from './store.js';
import * as G from './google.js';

const EVERY = 12 * 60 * 60 * 1000;

export async function backupNow() {
  if (!G.isReady()) throw new Error('Conecta Google en Ajustes');
  if (G.hasDrive() === false) throw new Error('Falta el permiso de Drive: pulsa «Reconectar» en Ajustes');
  const id = await G.driveSaveBackup(exportJSON(), db().settings.driveFileId);
  update((d) => {
    d.settings.driveFileId = id;
    d.settings.lastDriveBackup = Date.now();
  });
}

export async function autoBackup() {
  const s = db().settings;
  if (!s.driveBackup || !G.isReady() || G.hasDrive() === false) return;
  if (Date.now() - (s.lastDriveBackup || 0) < EVERY) return;
  try {
    await backupNow();
  } catch (e) {
    console.warn('Copia en Drive no realizada', e);
  }
}

export async function restoreFromDrive() {
  if (!G.isReady()) throw new Error('Conecta Google en Ajustes');
  const file = await G.driveFindBackup();
  if (!file) throw new Error('No hay ninguna copia de Mi Día en tu Google Drive');
  importJSON(await G.driveLoadBackup(file.id));
  update((d) => (d.settings.driveFileId = file.id));
  return file.modifiedTime;
}
