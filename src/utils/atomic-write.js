/**
 * @module atomic-write
 * @description Scrittura file atomica cross-platform con fallback.
 */
import { writeFile, rename, unlink, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * @description Scrive file in modo atomico con backup automatico opzionale.
 * @param {string} filePath - Path destinazione.
 * @param {string} content - Contenuto da scrivere.
 * @param {Object} options - { backup: boolean, mode: number }
 * @returns {Promise<Object>} Esito operazione e path backup
 * @throws {Error} In caso di fallimento filesystem
 */
export async function atomicWrite(filePath, content, options = {}) {
    const { backup = true, mode = 0o644 } = options;
    const tempFile = path.join(tmpdir(), `.gt-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    const backupPath = `${filePath}.bak`;

    try {
        // Scrittura su file temporaneo
        await writeFile(tempFile, content, { mode, encoding: 'utf8' });

        // Backup esistente se richiesto
        if (backup && existsSync(filePath)) {
            await copyFile(filePath, backupPath);
        }

        // Atomic rename (POSIX) o safe best-effort (Windows)
        try {
            await rename(tempFile, filePath);
        } catch (renameErr) {
            if (process.platform === 'win32' && (renameErr.code === 'EACCES' || renameErr.code === 'EPERM' || renameErr.code === 'EBUSY')) {
                let success = false;
                for (let i = 0; i < 5; i++) {
                    await new Promise(r => setTimeout(r, 100 * (2 ** i)));
                    try {
                        await rename(tempFile, filePath);
                        success = true;
                        break;
                    } catch (_) { }
                }
                if (!success) throw new Error(`Rename failed on Windows after 5 retries`);
            } else {
                throw renameErr;
            }
        }

        return { success: true, backupPath: backup ? backupPath : null };
    } catch (err) {
        // Cleanup temp in caso di errore catch
        await unlink(tempFile).catch(() => { });
        throw err;
    }
}
