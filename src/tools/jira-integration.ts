import { Tool, ToolResult } from './base.js';
import axios from 'axios';

export class JiraIntegrationTool implements Tool {
    name = 'jiraIntegration';
    description = 'Integrate with Jira for issue tracking and project management';
    
    schema = {
        action: {
            type: 'string',
            enum: ['createIssue', 'updateIssue', 'getIssue', 'listIssues', 'createSprint', 'moveToSprint'],
            description: 'Action to perform'
        },
        projectKey: {
            type: 'string',
            description: 'Jira project key'
        },
        issueData: {
            type: 'object',
            description: 'Issue details for create/update operations'
        },
        issueKey: {
            type: 'string',
            description: 'Issue key for specific issue operations'
        },
        query: {
            type: 'string',
            description: 'JQL query for searching issues'
        }
    };
    
    private apiUrl: string;
    private email: string;
    private apiToken: string;
    
    constructor() {
        // Load from environment or config
        this.apiUrl = process.env.JIRA_URL || 'https://your-domain.atlassian.net';
        this.email = process.env.JIRA_EMAIL || '';
        this.apiToken = process.env.JIRA_API_TOKEN || '';
    }
    
    async execute(params: any): Promise<ToolResult> {
        if (!this.isConfigured()) {
            return {
                success: false,
                error: 'Jira integration not configured. Please set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.'
            };
        }
        
        try {
            switch (params.action) {
                case 'createIssue':
                    return await this.createIssue(params.projectKey, params.issueData);
                    
                case 'updateIssue':
                    return await this.updateIssue(params.issueKey, params.issueData);
                    
                case 'getIssue':
                    return await this.getIssue(params.issueKey);
                    
                case 'listIssues':
                    return await this.listIssues(params.projectKey, params.query);
                    
                case 'createSprint':
                    return await this.createSprint(params.projectKey, params.issueData);
                    
                case 'moveToSprint':
                    return await this.moveToSprint(params.issueKey, params.sprintId);
                    
                default:
                    return {
                        success: false,
                        error: `Unknown action: ${params.action}`
                    };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    private isConfigured(): boolean {
        return !!(this.apiUrl && this.email && this.apiToken);
    }
    
    private getAuthHeader(): string {
        return 'Basic ' + Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    }
    
    private async createIssue(projectKey: string, issueData: any): Promise<ToolResult> {
        const response = await axios.post(
            `${this.apiUrl}/rest/api/3/issue`,
            {
                fields: {
                    project: { key: projectKey },
                    summary: issueData.summary,
                    description: {
                        type: 'doc',
                        version: 1,
                        content: [{
                            type: 'paragraph',
                            content: [{
                                type: 'text',
                                text: issueData.description || ''
                            }]
                        }]
                    },
                    issuetype: { name: issueData.issueType || 'Task' },
                    priority: { name: issueData.priority || 'Medium' },
                    ...(issueData.assignee && { assignee: { accountId: issueData.assignee } }),
                    ...(issueData.labels && { labels: issueData.labels }),
                    ...(issueData.components && { components: issueData.components.map((c: string) => ({ name: c })) })
                }
            },
            {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return {
            success: true,
            data: {
                issueKey: response.data.key,
                issueId: response.data.id,
                url: `${this.apiUrl}/browse/${response.data.key}`
            }
        };
    }
    
    private async updateIssue(issueKey: string, issueData: any): Promise<ToolResult> {
        const updateFields: any = {};
        
        if (issueData.summary) updateFields.summary = issueData.summary;
        if (issueData.description) {
            updateFields.description = {
                type: 'doc',
                version: 1,
                content: [{
                    type: 'paragraph',
                    content: [{
                        type: 'text',
                        text: issueData.description
                    }]
                }]
            };
        }
        if (issueData.priority) updateFields.priority = { name: issueData.priority };
        if (issueData.assignee) updateFields.assignee = { accountId: issueData.assignee };
        if (issueData.labels) updateFields.labels = issueData.labels;
        
        await axios.put(
            `${this.apiUrl}/rest/api/3/issue/${issueKey}`,
            { fields: updateFields },
            {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return {
            success: true,
            data: {
                issueKey,
                message: 'Issue updated successfully'
            }
        };
    }
    
    private async getIssue(issueKey: string): Promise<ToolResult> {
        const response = await axios.get(
            `${this.apiUrl}/rest/api/3/issue/${issueKey}`,
            {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json'
                }
            }
        );
        
        const issue = response.data;
        return {
            success: true,
            data: {
                key: issue.key,
                summary: issue.fields.summary,
                description: this.extractDescription(issue.fields.description),
                status: issue.fields.status.name,
                priority: issue.fields.priority?.name,
                assignee: issue.fields.assignee?.displayName,
                created: issue.fields.created,
                updated: issue.fields.updated,
                url: `${this.apiUrl}/browse/${issue.key}`
            }
        };
    }
    
    private async listIssues(projectKey?: string, query?: string): Promise<ToolResult> {
        let jql = query || '';
        if (projectKey && !query) {
            jql = `project = ${projectKey} ORDER BY created DESC`;
        }
        
        const response = await axios.get(
            `${this.apiUrl}/rest/api/3/search`,
            {
                params: {
                    jql,
                    maxResults: 50
                },
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json'
                }
            }
        );
        
        const issues = response.data.issues.map((issue: any) => ({
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name,
            assignee: issue.fields.assignee?.displayName,
            created: issue.fields.created
        }));
        
        return {
            success: true,
            data: {
                total: response.data.total,
                issues
            }
        };
    }
    
    private async createSprint(projectKey: string, sprintData: any): Promise<ToolResult> {
        // First, get the board ID for the project
        const boardsResponse = await axios.get(
            `${this.apiUrl}/rest/agile/1.0/board`,
            {
                params: {
                    projectKeyOrId: projectKey
                },
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json'
                }
            }
        );
        
        if (boardsResponse.data.values.length === 0) {
            return {
                success: false,
                error: 'No board found for project'
            };
        }
        
        const boardId = boardsResponse.data.values[0].id;
        
        // Create the sprint
        const response = await axios.post(
            `${this.apiUrl}/rest/agile/1.0/sprint`,
            {
                name: sprintData.name,
                startDate: sprintData.startDate,
                endDate: sprintData.endDate,
                originBoardId: boardId,
                goal: sprintData.goal
            },
            {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return {
            success: true,
            data: {
                sprintId: response.data.id,
                name: response.data.name,
                state: response.data.state
            }
        };
    }
    
    private async moveToSprint(issueKey: string, sprintId: number): Promise<ToolResult> {
        await axios.post(
            `${this.apiUrl}/rest/agile/1.0/sprint/${sprintId}/issue`,
            {
                issues: [issueKey]
            },
            {
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return {
            success: true,
            data: {
                message: `Issue ${issueKey} moved to sprint ${sprintId}`
            }
        };
    }
    
    private extractDescription(description: any): string {
        if (!description) return '';
        if (typeof description === 'string') return description;
        
        // Handle Jira's document format
        if (description.content) {
            return description.content
                .map((block: any) => {
                    if (block.content) {
                        return block.content
                            .map((item: any) => item.text || '')
                            .join('');
                    }
                    return '';
                })
                .join('\n');
        }
        
        return '';
    }
}