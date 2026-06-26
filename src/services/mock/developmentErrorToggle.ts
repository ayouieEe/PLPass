export type MockErrorMode = "none" | "empty" | "not_found" | "permission_denied" | "validation_error" | "server_error";

type ToggleState = {
  globalMode: MockErrorMode;
  repositoryModes: Partial<Record<string, MockErrorMode>>;
};

const state: ToggleState = {
  globalMode: "none",
  repositoryModes: {}
};

function canActivateErrorSimulation() {
  return import.meta.env.MODE === "test";
}

function resolveAllowedMode(mode: MockErrorMode): MockErrorMode {
  if (mode === "none" || canActivateErrorSimulation()) {
    return mode;
  }

  return "none";
}

export const developmentErrorToggle = {
  getMode(repositoryName: string): MockErrorMode {
    return state.repositoryModes[repositoryName] ?? state.globalMode;
  },
  setGlobalMode(mode: MockErrorMode) {
    state.globalMode = resolveAllowedMode(mode);
  },
  setRepositoryMode(repositoryName: string, mode: MockErrorMode) {
    state.repositoryModes[repositoryName] = resolveAllowedMode(mode);
  },
  reset() {
    state.globalMode = "none";
    state.repositoryModes = {};
  }
};
