/** @type {import('electron-builder').Configuration} */
const branding = require("./branding.json");
const pkg = require("./package.json");

/**
 * electron-builder configuration. Branding strings (appId, productName,
 * copyright, shortcut name) come from `branding.json` so a forked
 * character repo only needs to edit one file before `npm run dist`.
 *
 * Version is taken from package.json (single semver source).
 */
module.exports = {
  appId: branding.appId,
  productName: branding.productName,
  copyright: branding.copyright,
  directories: {
    buildResources: "build",
    output: "dist-app",
  },
  asar: true,
  // Native module must load from filesystem, not from inside app.asar.
  asarUnpack: ["**/node_modules/active-win/**/*"],
  // active-win ships N-API prebuilds (napi-6-win32-unknown-x64). Skip
  // @electron/rebuild so local `npm run dist` works without VS Build Tools.
  npmRebuild: false,
  files: [
    "dist/**/*",
    "dist-electron/**/*",
    "package.json",
    "branding.json",
    "!node_modules/active-win/main",
    "!node_modules/active-win/main-arm64",
    "node_modules/active-win/**/*",
    "!node_modules/active-win/lib/binding/napi-6-darwin-unknown-*",
    "!node_modules/active-win/lib/binding/napi-6-linux-*",
  ],
  extraResources: [
    {
      from: "assets/",
      to: "assets/",
      filter: ["tray.ico", "tray.png", "tray-*.png"],
    },
  ],
  win: {
    icon: "build/icon.ico",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "zip", arch: ["x64"] },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: branding.productName,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    include: "build/installer.nsh",
  },
  publish: null,
  // Expose version for artifact naming (electron-builder reads package.json
  // automatically; this documents the link for template authors).
  extraMetadata: {
    version: pkg.version,
  },
};
