import { ExternalAgentControl, ExternalAgentDescriptor } from './types';

export class ExternalAgentRegistry {
  private readonly agents = new Map<string, ExternalAgentControl>();

  register(agent: ExternalAgentControl): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`External agent already registered: ${agent.id}`);
    }
    this.agents.set(agent.id, agent);
  }

  get(agentId: string): ExternalAgentControl | undefined {
    return this.agents.get(agentId);
  }

  require(agentId: string): ExternalAgentControl {
    const agent = this.get(agentId);
    if (!agent) {
      throw new Error(`External agent not found: ${agentId}`);
    }
    return agent;
  }

  list(): ExternalAgentDescriptor[] {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      kind: agent.kind,
      displayName: agent.displayName,
      enabled: agent.enabled,
      capabilities: [...agent.capabilities],
    }));
  }
}
