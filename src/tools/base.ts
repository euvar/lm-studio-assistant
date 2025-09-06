export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  execute: (params: any) => Promise<ToolResult>;
}

export interface ToolCall {
  tool: string;
  parameters: any;
}