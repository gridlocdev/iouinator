// electron-builder's afterPack hook: flips Electron's fuses in the packaged binary before it is signed.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';

/** @param {import('electron-builder').AfterPackContext} context */
export default async function flipElectronFuses({ appOutDir, electronPlatformName, packager }) {
  const mac = electronPlatformName === 'darwin' || electronPlatformName === 'mas';
  const name = packager.appInfo.productFilename;
  const binary = mac
    ? `${name}.app`
    : electronPlatformName === 'win32'
      ? `${name}.exe`
      : packager.executableName;
  const resources = mac
    ? join(appOutDir, `${name}.app`, 'Contents', 'Resources')
    : join(appOutDir, 'resources');
  await flipFuses(join(appOutDir, binary), {
    version: FuseVersion.V1,
    // The ad-hoc signature no longer matches once the binary changes; electron-builder signs again after this.
    resetAdHocDarwinSignature: mac,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: existsSync(join(resources, 'app.asar')),
  });
}
