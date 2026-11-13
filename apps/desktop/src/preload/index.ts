import { contextBridge, ipcRenderer } from 'electron';
import type { ArchpiApi, ArchpiEvent } from '@archpi/shared';

const api: ArchpiApi = {
  getSnapshot: () => ipcRenderer.invoke('archpi:getSnapshot'),
  createProject: (input) => ipcRenderer.invoke('archpi:createProject', input),
  createWindow: (input) => ipcRenderer.invoke('archpi:createWindow', input),
  renameWindow: (windowId, title) => ipcRenderer.invoke('archpi:renameWindow', windowId, title),
  archiveWindow: (windowId, archived) =>
    ipcRenderer.invoke('archpi:archiveWindow', windowId, archived),
  closeWindow: (windowId) => ipcRenderer.invoke('archpi:closeWindow', windowId),
  sendMessage: (windowId, content, options) =>
    ipcRenderer.invoke('archpi:sendMessage', windowId, content, options),
  dispatchPlan: (input) => ipcRenderer.invoke('archpi:dispatchPlan', input),
  requestReview: (input) => ipcRenderer.invoke('archpi:requestReview', input),
  updateProviderConfig: (config) => ipcRenderer.invoke('archpi:updateProviderConfig', config),
  syncProviderConfigs: (configs) => ipcRenderer.invoke('archpi:syncProviderConfigs', configs),
  updateVoiceConfig: (config) => ipcRenderer.invoke('archpi:updateVoiceConfig', config),
  updateSettings: (patch) => ipcRenderer.invoke('archpi:updateSettings', patch),
  testAgyModels: (refreshToken?: string) => ipcRenderer.invoke('archpi:testAgyModels', refreshToken),
  fetchAgyModels: (refreshToken?: string) => ipcRenderer.invoke('archpi:fetchAgyModels', refreshToken),
  importAgyFromCli: () => ipcRenderer.invoke('archpi:importAgyFromCli'),
  startAgyOAuth: () => ipcRenderer.invoke('archpi:startAgyOAuth'),
  fetchAgyQuota: (refreshToken?: string) =>
    ipcRenderer.invoke('archpi:fetchAgyQuota', refreshToken),
  fetchProviderBalance: (input: { baseUrl: string; apiKey: string }) =>
    ipcRenderer.invoke('archpi:fetchProviderBalance', input),
  warmupAgyAccount: (refreshToken?: string, models?: string[]) =>
    ipcRenderer.invoke('archpi:warmupAgyAccount', refreshToken, models),
  selectDirectory: () => ipcRenderer.invoke('archpi:selectDirectory'),
  windowMinimize: () => ipcRenderer.invoke('archpi:windowMinimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('archpi:windowToggleMaximize'),
  windowClose: () => ipcRenderer.invoke('archpi:windowClose'),
  windowIsMaximized: () => ipcRenderer.invoke('archpi:windowIsMaximized'),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ArchpiEvent) => {
      callback(payload);
    };
    ipcRenderer.on('archpi:event', listener);
    return () => {
      ipcRenderer.removeListener('archpi:event', listener);
    };
  }
};

contextBridge.exposeInMainWorld('archpi', api);
