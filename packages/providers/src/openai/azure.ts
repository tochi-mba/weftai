/** Azure OpenAI deployment URL for Chat Completions (`api-key` header, not Bearer). */
export function azureDeploymentURL(
  resource: string,
  deployment: string,
  apiVersion = "2024-10-21",
): string {
  return `https://${resource}.openai.azure.com/openai/deployments/${deployment}?api-version=${apiVersion}`;
}

/** Azure AI Foundry `/openai/v1/` base, used for both Chat Completions and Responses. */
export function azureFoundryURL(resource: string): string {
  return `https://${resource}.openai.azure.com/openai/v1/`;
}

export function azureHeaders(apiKey: string): { readonly "api-key": string } {
  return { "api-key": apiKey };
}
