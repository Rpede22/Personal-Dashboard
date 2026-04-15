const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 3001; // Use 3001 to avoid conflicts with any running Next.js dev server
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
        .get(url, (res) => {
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeout) {
            reject(new Error(`Server at ${url} did not start within ${timeout}ms`));
          } else {
            setTimeout(check, 300);
          }
        });
    }
    check();
  });
}

// ------------------------------------------------------------------
// Start the Next.js standalone server (production only)
// ------------------------------------------------------------------
function startNextServer() {
  return new Promise((resolve, reject) => {
    if (DEV) {
      // In dev the user runs `npm run dev` separately (or via npm run electron:dev)
      resolve();
      return;
    }

    // Path to the standalone server built by `next build`
    const serverPath = path.join(
      app.getAppPath(),
      ".next",
      "standalone",
      "server.js"
    );

    nextProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "production",
        // Tell Next.js where to find static assets inside the app bundle
        NEXT_PUBLIC_BASE_URL: `http://localhost:${PORT}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    nextProcess.stdout?.on("data", (d) => {
      const line = d.toString();
      if (line.includes("Ready") || line.includes("started server")) resolve();
    });

    nextProcess.stderr?.on("data", (d) => {
      console.error("[next]", d.toString());
    });

    nextProcess.on("error", reject);

    // Safety: also resolve once HTTP responds
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
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f1117",
    show: false, // show after content loads to avoid white flash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "Dashboard",
    icon: path.join(__dirname, "icon.png"),
  });

  const url = DEV
    ? `http://localhost:3000` // dev server (next dev)
    : `http://localhost:${PORT}`;

  mainWindow.loadURL(url);

  // Show window once the page has painted
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in the default browser, not inside Electron
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
    await startNextServer();
    if (!DEV) {
      // Give the server a moment to be fully ready in production
      await waitForServer(`http://localhost:${PORT}`);
    }
    await createWindow();
  } catch (err) {
    console.error("Failed to start:", err);
    app.quit();
  }

  app.on("activate", () => {
    // macOS: re-open window when clicking the dock icon
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
