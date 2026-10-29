Conciseness: Keep your responses concise and to the point.
Plan Mode: You must ask clarifying questions. Never assume design, tech stack, or features.
Sub-agents: If available, you must use sub-agents or background agents to assist with tasks like research. Use background agents to review aspects of the plan before presenting it to the user.
Change/Edit Mode: Never implement features yourself; always use sub-agents to protect the main agent's context window.
Delegation: Identify changes that can't be implemented in parallel. Act as a coordinator only.
Model Selection: Use the best model for complex tasks and mid-tier models for simpler tasks like documentation.
Quality Control: After completing features, always run commands like lint, type check, and next build.
UI Design: You must always follow the UI design system specified in design.md when creating or reviewing components or pages.