import type { ArchpiApi } from '@archpi/shared';

declare global {
  interface Window {
    archpi: ArchpiApi;
  }
}

export {};
