import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Obter o __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binDir = path.join(__dirname, '../src-tauri/bin');
const ffmpegPath = path.join(binDir, 'ffmpeg.exe');
const ffprobePath = path.join(binDir, 'ffprobe.exe');
const ffplayPath = path.join(binDir, 'ffplay.exe');

// 1. Verificar se os binários principais já existem
if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
    console.log('✅ Binários do FFmpeg detetados em src-tauri/bin/. Nenhuma ação necessária.');
    process.exit(0);
}

console.log('📥 Binários do FFmpeg em falta na pasta src-tauri/bin/. A iniciar o download automático...');

if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
}

// URL oficial da build essencial do FFmpeg para Windows
const zipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
const zipPath = path.join(binDir, 'ffmpeg.zip');

const downloadFile = (url) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);
        
        https.get(url, (response) => {
            // Tratar redirecionamentos HTTP
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadFile(response.headers.location).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`Código de resposta HTTP: ${response.statusCode}`));
            }

            let downloaded = 0;
            const totalLength = parseInt(response.headers['content-length'], 10);

            response.on('data', (chunk) => {
                downloaded += chunk.length;
                if (totalLength) {
                    const percent = ((downloaded / totalLength) * 100).toFixed(1);
                    process.stdout.write(`\r[Download FFmpeg] Progresso: ${percent}%...`);
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log('\n📦 Download concluído. A extrair ficheiros...');
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(zipPath, () => {});
            reject(err);
        });
    });
};

async function setupFFmpeg() {
    try {
        await downloadFile(zipUrl);

        // Extrair zip usando o PowerShell nativo do Windows
        const extractCmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${binDir}' -Force"`;
        execSync(extractCmd, { stdio: 'ignore' });

        // Localizar a pasta extraída gerada pela release
        const items = fs.readdirSync(binDir);
        const extractedFolder = items.find(item => 
            item.startsWith('ffmpeg-') && fs.statSync(path.join(binDir, item)).isDirectory()
        );

        if (extractedFolder) {
            const extractedBinDir = path.join(binDir, extractedFolder, 'bin');
            
            // Mover executáveis para a pasta raiz src-tauri/bin/
            ['ffmpeg.exe', 'ffprobe.exe', 'ffplay.exe'].forEach(exe => {
                const src = path.join(extractedBinDir, exe);
                const dest = path.join(binDir, exe);
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, dest);
                }
            });

            // Apagar a pasta extraída temporária
            fs.rmSync(path.join(binDir, extractedFolder), { recursive: true, force: true });
        }

        // Apagar o zip temporário
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }

        console.log('✨ Sucesso! Binários do FFmpeg (ffmpeg.exe, ffprobe.exe, ffplay.exe) configurados em src-tauri/bin/.');
    } catch (error) {
        console.error('❌ Erro durante a configuração do FFmpeg:', error.message);
        process.exit(1);
    }
}

setupFFmpeg();