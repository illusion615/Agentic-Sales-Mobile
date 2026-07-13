// Local development declarations for globals supplied by the Power Apps host.
export {};

declare global {
  interface Window {
    Xrm?: {
      Utility?: {
        getGlobalContext?: () => {
          userSettings?: { languageId?: number };
        };
      };
    };
  }
}
