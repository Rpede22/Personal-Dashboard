const { app, BrowserWindow, shell, nativeImage, dialog, utilityProcess } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const PORT = 3001;
const DEV = process.env.NODE_ENV === "development";

// Parse a .env file and return key/value pairs (ignores comments + blank lines)
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    vars[key] = val;
  }
  return vars;
}

let mainWindow = null;
let nextProcess = null;

// ------------------------------------------------------------------
// Wait for the Next.js server to accept connections
// ------------------------------------------------------------------
function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      http
        .get(url, () => resolve())
        .on("error", () => {
          if (Date.now() - start > timeout) {
            reject(new Error(`Server at ${url} timed out after ${timeout}ms`));
          } else {
            setTimeout(check, 300);
          }
        });
    }
    check();
  });
}

// ------------------------------------------------------------------
// Ensure the user's data directory has a fresh database.
// Always overwrites so a rebuilt app gets the latest seed schema/data.
// ------------------------------------------------------------------
function ensureDatabase() {
  const userData = app.getPath("userData");
  const dbDest = path.join(userData, "dashboard.db");
  const dbSrc = path.join(process.resourcesPath, "db", "seed.db");

  fs.mkdirSync(userData, { recursive: true });
  if (fs.existsSync(dbSrc)) {
    fs.copyFileSync(dbSrc, dbDest);
  }

  return dbDest;
}

// ------------------------------------------------------------------
// Start the Next.js standalone server (production only)
// ------------------------------------------------------------------
function startNextServer(dbPath) {
  return new Promise((resolve, reject) => {
    if (DEV) {
      resolve();
      return;
    }

    const serverPath = path.join(process.resourcesPath, "standalone", "server.js");
    const staticPath  = path.join(process.resourcesPath, "static");
    const publicPath  = path.join(process.resourcesPath, "public");

    // Log file so we can diagnose crashes even after the app quits
    const logPath = path.join(app.getPath("userData"), "server.log");
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const logLine = (tag, msg) => {
      const line = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
      logStream.write(line);
      console.log(line.trimEnd());
    };

    logLine("INFO", `Starting server: ${serverPath}`);
    logLine("INFO", `DB path: ${dbPath}`);
    logLine("INFO", `execPath: ${process.execPath}`);

    if (!fs.existsSync(serverPath)) {
      const err = new Error(`server.js not found at:\n${serverPath}`);
      logLine("ERROR", err.message);
      reject(err);
      return;
    }

    // Collect stderr so we can show it in the error dialog
    const stderrLines = [];

    // Load .env.local bundled alongside server.js so API keys reach the server
    const envVars = loadEnvFile(path.join(process.resourcesPath, "standalone", ".env.local"));
    logLine("INFO", `Loaded ${Object.keys(envVars).length} vars from .env.local`);

    // utilityProcess.fork runs as a hidden Node.js child — no dock icon, no Electron lifecycle
    nextProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        ...envVars,          // API keys from bundled .env.local
        PORT: String(PORT),
        NODE_ENV: "production",
        __NEXT_PRIVATE_STANDALONE_CONFIG: JSON.stringify({}),
        NEXT_MANUAL_SIG_HANDLE: "true",
        DATABASE_PATH: dbPath,
        DATABASE_URL: `file:${dbPath}`,
        NEXTJS_STATIC_DIR: staticPath,
        NEXTJS_PUBLIC_DIR: publicPath,
      },
      cwd: path.join(process.resourcesPath, "standalone"),
      stdio: "pipe",
      serviceName: "next-server",
    });

    nextProcess.stdout?.on("data", (d) => {
      const line = d.toString().trim();
      logLine("STDOUT", line);
      if (line.includes("Ready") || line.includes("started server") || line.includes("Listening")) {
        resolve();
      }
    });

    nextProcess.stderr?.on("data", (d) => {
      const line = d.toString().trim();
      logLine("STDERR", line);
      stderrLines.push(line);
    });

    nextProcess.on("exit", (code) => {
      logLine("EXIT", `code=${code}`);
      if (code !== 0 && code !== null) {
        const detail = stderrLines.slice(-10).join("\n") || "(no stderr output)";
        reject(new Error(`Next.js server exited with code ${code}\n\n${detail}`));
      }
    });

    // Safety net: reject after timeout with any collected stderr
    waitForServer(`http://localhost:${PORT}`).then(resolve).catch(() => {
      const detail = stderrLines.slice(-10).join("\n") || "(no stderr — server may not have started at all)";
      reject(new Error(`Server at http://localhost:${PORT} timed out after 30s\n\nLog: ${logPath}\n\n${detail}`));
    });
  });
}

// ------------------------------------------------------------------
// Create the browser window
// ------------------------------------------------------------------
async function createWindow() {
  const iconPath = path.join(__dirname, "..", "public", "icon.png");
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 500,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 12, y: 8 } : undefined,
    backgroundColor: "#0f1117",
    show: false,
    icon: appIcon ?? undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "Dashboard",
  });

  if (process.platform === "darwin" && appIcon) {
    app.dock.setIcon(appIcon);
  }

  const url = DEV
    ? "http://localhost:3000"
    : `http://localhost:${PORT}`;

  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ------------------------------------------------------------------
// App lifecycle
// ------------------------------------------------------------------
app.setName("Dashboard");

// Enforce a single instance — if a second instance launches, focus the
// existing window and quit the new one immediately.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      const dbPath = DEV
        ? path.join(process.cwd(), "dev.db")
        : ensureDatabase();

      await startNextServer(dbPath);

      if (!DEV) {
        await waitForServer(`http://localhost:${PORT}`);
      }

      await createWindow();
    } catch (err) {
      console.error("Failed to start dashboard:", err);
      dialog.showErrorBox(
        "Dashboard failed to start",
        String(err?.message ?? err)
      );
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});
