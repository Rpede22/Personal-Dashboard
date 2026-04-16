const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

const PORT = 3001;
const DEV = process.env.NODE_ENV === "development";

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
// Ensure the user's data directory has a fresh database on first run
// ------------------------------------------------------------------
function ensureDatabase() {
  const userData = app.getPath("userData");
  const dbDest = path.join(userData, "dashboard.db");

  if (!fs.existsSync(dbDest)) {
    // Copy the seed database from the app resources on first launch
    const dbSrc = path.join(process.resourcesPath, "db", "seed.db");
    if (fs.existsSync(dbSrc)) {
      fs.mkdirSync(userData, { recursive: true });
      fs.copyFileSync(dbSrc, dbDest);
    }
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

    // In production the standalone server lives in the app resources folder
    const serverPath = path.join(
      process.resourcesPath,
      "standalone",
      "server.js"
    );

    // Static files location (also in resources)
    const staticPath = path.join(process.resourcesPath, "static");
    const publicPath = path.join(process.resourcesPath, "public");

    nextProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "production",
        // Point Next.js static/public files to the resources folder
        __NEXT_PRIVATE_STANDALONE_CONFIG: JSON.stringify({}),
        NEXT_MANUAL_SIG_HANDLE: "true",
        // Database path passed to the API routes
        DATABASE_PATH: dbPath,
        DATABASE_URL: `file:${dbPath}`,
        NEXTJS_STATIC_DIR: staticPath,
        NEXTJS_PUBLIC_DIR: publicPath,
      },
      cwd: path.join(process.resourcesPath, "standalone"),
      stdio: ["ignore", "pipe", "pipe"],
    });

    nextProcess.stdout?.on("data", (d) => {
      const line = d.toString();
      if (
        line.includes("Ready") ||
        line.includes("started server") ||
        line.includes("Listening")
      ) {
        resolve();
      }
    });

    nextProcess.stderr?.on("data", (d) => {
      console.error("[next]", d.toString());
    });

    nextProcess.on("error", reject);
    nextProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Next.js server exited with code ${code}`));
      }
    });

    // Safety net: resolve once HTTP actually responds
    waitForServer(`http://localhost:${PORT}`).then(resolve).catch(reject);
  });
}

// ------------------------------------------------------------------
// Create the browser window
// ------------------------------------------------------------------
async function createWindow() {
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "Dashboard",
  });

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
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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
