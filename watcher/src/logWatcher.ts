import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chokidar from 'chokidar';
import { parseLine } from './logParser';
import type { LogEvent } from './logParser';

const HS_LOGS_DIR = '/Applications/Hearthstone/Logs';
const LOG_CONFIG_PATH = path.join(
  os.homedir(),
  'Library/Preferences/Blizzard/Hearthstone/log.config'
);

/**
 * Hearthstone creates a new dated session directory each launch, e.g.:
 *   /Applications/Hearthstone/Logs/Hearthstone_2026_03_24_11_30_06/Power.log
 * Find the most recently modified one.
 */
function findLatestLogPath(): string | null {
  if (!fs.existsSync(HS_LOGS_DIR)) return null;
  const entries = fs.readdirSync(HS_LOGS_DIR);
  const sessionDirs = entries
    .filter((e) => e.startsWith('Hearthstone_'))
    .map((e) => ({
      name: e,
      mtime: fs.statSync(path.join(HS_LOGS_DIR, e)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (sessionDirs.length === 0) return null;
  const candidate = path.join(HS_LOGS_DIR, sessionDirs[0].name, 'Power.log');
  return fs.existsSync(candidate) ? candidate : null;
}

const REQUIRED_LOG_CONFIG = `[Power]
LogLevel=1
FilePrinting=True
ConsolePrinting=False
ScreenPrinting=False
Verbose=True
`;

export function ensureLogConfig(): void {
  const dir = path.dirname(LOG_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(LOG_CONFIG_PATH)) {
    const existing = fs.readFileSync(LOG_CONFIG_PATH, 'utf8');
    if (existing.includes('[Power]') && existing.includes('FilePrinting=True')) {
      console.log('[config] log.config OK');
      return;
    }
    // Append our section if missing
    if (!existing.includes('[Power]')) {
      fs.appendFileSync(LOG_CONFIG_PATH, '\n' + REQUIRED_LOG_CONFIG);
      console.log('[config] Appended [Power] section to log.config');
      return;
    }
  } else {
    fs.writeFileSync(LOG_CONFIG_PATH, REQUIRED_LOG_CONFIG);
    console.log('[config] Created log.config');
  }
}

/**
 * Starts tailing Power.log and calls onEvent for each parsed event.
 * Seeks to the end of the current log on startup — does not replay history.
 * Automatically switches to a new session directory when Hearthstone relaunches.
 */
export function startWatching(onEvent: (event: LogEvent) => void): void {
  let currentLogPath = findLatestLogPath();

  if (!currentLogPath) {
    console.warn('[watcher] No Power.log found — waiting for Hearthstone to launch');
  } else {
    console.log(`[watcher] Found log: ${currentLogPath}`);
  }

  let fileSize = currentLogPath ? fs.statSync(currentLogPath).size : 0;
  let buffer = '';
  let fileWatcher: ReturnType<typeof chokidar.watch> | null = null;

  function readNewBytes(): void {
    if (!currentLogPath || !fs.existsSync(currentLogPath)) return;

    const stat = fs.statSync(currentLogPath);

    // Log shrank — new HS session wrote a fresh file
    if (stat.size < fileSize) {
      console.log('[watcher] Log file reset — new Hearthstone session');
      fileSize = 0;
      buffer = '';
    }

    if (stat.size === fileSize) return;

    const stream = fs.createReadStream(currentLogPath, {
      start: fileSize,
      end: stat.size - 1,
      encoding: 'utf8',
    });

    stream.on('data', (chunk: string | Buffer) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = parseLine(line);
          if (event) onEvent(event);
        } catch {
          // Ignore malformed lines
        }
      }
    });

    stream.on('end', () => {
      fileSize = stat.size;
    });
  }

  function replayFromLastGame(logPath: string): void {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');

    // Find the index of the last CREATE_GAME line
    let lastGameStart = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('GameState.DebugPrintPower() - CREATE_GAME')) {
        lastGameStart = i;
        break;
      }
    }

    if (lastGameStart === -1) {
      console.log('[watcher] No CREATE_GAME found in log — waiting for a new game');
      return;
    }

    console.log(`[watcher] Replaying from CREATE_GAME at line ${lastGameStart + 1}`);
    for (let i = lastGameStart; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const event = parseLine(line);
        if (event) onEvent(event);
      } catch {
        // ignore
      }
    }
  }

  function watchLogFile(logPath: string): void {
    fileWatcher?.close();
    currentLogPath = logPath;
    fileSize = fs.statSync(logPath).size;
    buffer = '';
    replayFromLastGame(logPath);
    console.log(`[watcher] Watching ${logPath} for new events`);

    fileWatcher = chokidar.watch(logPath, {
      persistent: true,
      usePolling: false,
      ignoreInitial: true,
      awaitWriteFinish: false,
    });
    fileWatcher.on('change', readNewBytes);
  }

  // Watch the parent logs directory for new session directories (Hearthstone relaunch)
  const dirWatcher = chokidar.watch(HS_LOGS_DIR, {
    persistent: true,
    usePolling: false,
    ignoreInitial: true,
    depth: 1,
  });

  dirWatcher.on('add', (addedPath: string) => {
    if (path.basename(addedPath) === 'Power.log') {
      console.log(`[watcher] New session detected: ${addedPath}`);
      watchLogFile(addedPath);
    }
  });

  if (currentLogPath) {
    watchLogFile(currentLogPath);
  }
}
