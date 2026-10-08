import { contextBridge, ipcRenderer } from 'electron';
import { createDesktopApi } from './api';

contextBridge.exposeInMainWorld('modelwright', createDesktopApi(ipcRenderer));
