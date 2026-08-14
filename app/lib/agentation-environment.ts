type AgentationEnvironment = {
  nodeEnv?: string;
  vercelEnv?: string;
};

export function shouldShowAgentation({
  nodeEnv,
  vercelEnv,
}: AgentationEnvironment): boolean {
  if (vercelEnv === "production") {
    return false;
  }

  return (
    nodeEnv === "development" ||
    vercelEnv === "development" ||
    vercelEnv === "preview"
  );
}
