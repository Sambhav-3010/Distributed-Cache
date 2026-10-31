import { ServiceUnavailableError } from "@cachegrid/common/errors";

export class RouterService {
  #registry;
  #nextIndex = 0;

  constructor({ registry }) {
    this.#registry = registry;
  }

  selectNode({ excludeNodeId = null } = {}) {
    const healthy = this.#registry
      .getHealthyNodes()
      .filter((node) => node.nodeId !== excludeNodeId);

    if (healthy.length === 0) {
      throw new ServiceUnavailableError();
    }

    const node = healthy[this.#nextIndex % healthy.length];
    this.#nextIndex = (this.#nextIndex + 1) % healthy.length;
    return node;
  }
}
