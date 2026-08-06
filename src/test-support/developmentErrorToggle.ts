export type SimulatedErrorMode = "none" | "empty" | "not_found" | "permission_denied" | "validation_error" | "server_error";

type ToggleState = {
  globalMode: SimulatedErrorMode;
  repositoryModes: Partial<Record<string, SimulatedErrorMode>>;
};

const state: ToggleState = {
  globalMode: "none",
  repositoryModes: {}
};

function canActivateErrorSimulation() {
  return import.meta.env.MODE === "test";
}

function resolveAllowedMode(mode: SimulatedErrorMode): SimulatedErrorMode {
  if (mode === "none" || canActivateErrorSimulation()) {
    return mode;
  }

  return "none";
}

export const developmentErrorToggle = {
  getMode(repositoryName: string): SimulatedErrorMode {
    return state.repositoryModes[repositoryName] ?? state.globalMode;
  },
  setGlobalMode(mode: SimulatedErrorMode) {
    state.globalMode = resolveAllowedMode(mode);
  },
  setRepositoryMode(repositoryName: string, mode: SimulatedErrorMode) {
    state.repositoryModes[repositoryName] = resolveAllowedMode(mode);
  },
  reset() {
    state.globalMode = "none";
    state.repositoryModes = {};
  }
};
