import type { StepDef } from "../core/step.js";
import { resolveStep } from "./resolve.js";

/**
 * Agent role definition — a named specialist with a system prompt.
 * Inspired by CrewAI's role-based agent pattern.
 *
 * Usage:
 *   const reviewer = agent("code-reviewer", {
 *     role: "Senior code reviewer",
 *     goal: "Find bugs and suggest improvements",
 *     backstory: "You have 15 years of experience in TypeScript..."
 *   });
 *
 *   pipeline("review")
 *     .step(assign(reviewer, step("review").prompt("Review {file}")))
 */
export interface AgentRole {
  /** Unique agent name */
  name: string;
  /** What this agent does (becomes system prompt prefix) */
  role: string;
  /** What the agent is trying to achieve */
  goal: string;
  /** Background context that shapes responses */
  backstory?: string;
  /** Preferred model for this agent */
  model?: string;
}

/**
 * Define an agent role.
 */
export function agent(name: string, config: Omit<AgentRole, "name">): AgentRole {
  return { name, ...config };
}

/**
 * Assign an agent role to a step. Injects the agent's system prompt
 * and model preference into the step definition.
 */
export function assign(agentRole: AgentRole, s: StepDef | { build(): StepDef }): StepDef {
  const stepDef = resolveStep(s);

  const systemPrompt = [
    `You are ${agentRole.role}.`,
    `Your goal: ${agentRole.goal}`,
    agentRole.backstory ? `Background: ${agentRole.backstory}` : null,
    stepDef.systemPrompt ?? null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    ...stepDef,
    id: `${agentRole.name}:${stepDef.id}`,
    systemPrompt,
    model: agentRole.model ?? stepDef.model,
  };
}

/**
 * Create a multi-agent pipeline where each step is assigned to a specialist.
 * The agents work sequentially, each building on the previous agent's output.
 *
 * Usage:
 *   const crew = createCrew([
 *     { agent: researcher, step: step("research").prompt("...") },
 *     { agent: developer, step: step("implement").prompt("...") },
 *     { agent: reviewer, step: step("review").prompt("...") },
 *   ]);
 *
 *   pipeline("feature").step(crew[0]).step(crew[1]).step(crew[2])
 */
export function createCrew(
  assignments: Array<{ agent: AgentRole; step: StepDef | { build(): StepDef } }>,
): StepDef[] {
  return assignments.map(({ agent: a, step: s }) => assign(a, s));
}
