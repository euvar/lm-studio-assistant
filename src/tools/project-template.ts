import { Tool, ToolResult } from './base.js';
import { ProjectTemplateSystem } from '../core/project-templates.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import inquirer from 'inquirer';

export class ProjectTemplateTool implements Tool {
  name = 'projectTemplate';
  description = 'Generate new projects from templates';
  
  parameters = {
    action: {
      type: 'string' as const,
      description: 'Action to perform: list, search, generate, create',
      required: true
    },
    templateId: {
      type: 'string' as const,
      description: 'Template ID for generate action'
    },
    projectName: {
      type: 'string' as const,
      description: 'Project name for generate action'
    },
    directory: {
      type: 'string' as const,
      description: 'Directory to generate project in',
      default: '.'
    },
    category: {
      type: 'string' as const,
      description: 'Filter templates by category'
    },
    query: {
      type: 'string' as const,
      description: 'Search query for templates'
    },
    interactive: {
      type: 'boolean' as const,
      description: 'Run in interactive mode',
      default: false
    },
    variables: {
      type: 'object' as const,
      description: 'Template variables for generation'
    }
  };

  private templateSystem: ProjectTemplateSystem;

  constructor() {
    this.templateSystem = new ProjectTemplateSystem();
    this.initialize();
  }

  private async initialize() {
    await this.templateSystem.loadCustomTemplates();
  }

  async execute(params: any): Promise<ToolResult> {
    const { action } = params;

    try {
      switch (action) {
        case 'list':
          return await this.listTemplates(params);
          
        case 'search':
          return await this.searchTemplates(params);
          
        case 'generate':
          return await this.generateProject(params);
          
        case 'create':
          return await this.createTemplate(params);
          
        case 'info':
          return await this.getTemplateInfo(params);
          
        default:
          return {
            success: false,
            error: `Unknown action: ${action}. Available actions: list, search, generate, create, info`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Template operation failed: ${error.message}`
      };
    }
  }

  private async listTemplates(params: any): Promise<ToolResult> {
    const { category } = params;
    const templates = this.templateSystem.getTemplates(category);
    
    const templateList = templates.map(t => ({
      id: t.id,
      name: t.config.name,
      description: t.config.description,
      category: t.config.category,
      tags: t.config.tags,
      author: t.config.author,
      version: t.config.version,
      isBuiltIn: t.isBuiltIn,
      usageCount: t.usageCount
    }));

    // Group by category
    const grouped = templateList.reduce((acc, template) => {
      const cat = template.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(template);
      return acc;
    }, {} as Record<string, typeof templateList>);

    return {
      success: true,
      data: {
        total: templateList.length,
        templates: templateList,
        grouped,
        categories: Object.keys(grouped)
      }
    };
  }

  private async searchTemplates(params: any): Promise<ToolResult> {
    const { query } = params;
    
    if (!query) {
      return {
        success: false,
        error: 'Search query is required'
      };
    }

    const templates = this.templateSystem.searchTemplates(query);
    
    const results = templates.map(t => ({
      id: t.id,
      name: t.config.name,
      description: t.config.description,
      category: t.config.category,
      tags: t.config.tags,
      relevance: this.calculateRelevance(query, t)
    })).sort((a, b) => b.relevance - a.relevance);

    return {
      success: true,
      data: {
        query,
        results,
        count: results.length
      }
    };
  }

  private calculateRelevance(query: string, template: any): number {
    const lowerQuery = query.toLowerCase();
    let score = 0;

    // Exact match in name
    if (template.config.name.toLowerCase() === lowerQuery) score += 10;
    // Partial match in name
    else if (template.config.name.toLowerCase().includes(lowerQuery)) score += 5;
    
    // Match in description
    if (template.config.description.toLowerCase().includes(lowerQuery)) score += 3;
    
    // Match in tags
    template.config.tags.forEach((tag: string) => {
      if (tag.toLowerCase() === lowerQuery) score += 4;
      else if (tag.toLowerCase().includes(lowerQuery)) score += 2;
    });

    return score;
  }

  private async generateProject(params: any): Promise<ToolResult> {
    const { templateId, projectName, directory = '.', interactive = false, variables = {} } = params;

    if (!templateId) {
      return {
        success: false,
        error: 'Template ID is required'
      };
    }

    const template = this.templateSystem.getTemplate(templateId);
    if (!template) {
      return {
        success: false,
        error: `Template '${templateId}' not found`
      };
    }

    // Get project name
    let finalProjectName = projectName;
    if (!finalProjectName && interactive) {
      const answers = await inquirer.prompt([{
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        validate: (input: string) => input.length > 0 || 'Project name is required'
      }]);
      finalProjectName = answers.projectName;
    }

    if (!finalProjectName) {
      return {
        success: false,
        error: 'Project name is required'
      };
    }

    // Get template variables
    let finalVariables = { ...variables };
    
    if (interactive) {
      const prompts = template.config.variables
        .filter(v => v.required && !finalVariables[v.name])
        .map(v => {
          const prompt: any = {
            name: v.name,
            message: v.description || v.name,
            default: v.default
          };

          if (v.type === 'boolean') {
            prompt.type = 'confirm';
          } else if (v.type === 'choice' && v.choices) {
            prompt.type = 'list';
            prompt.choices = v.choices;
          } else {
            prompt.type = 'input';
            if (v.validation) {
              prompt.validate = (input: string) => {
                const regex = new RegExp(v.validation!);
                return regex.test(input) || `Invalid format (must match ${v.validation})`;
              };
            }
          }

          return prompt;
        });

      if (prompts.length > 0) {
        console.log('\nTemplate configuration:');
        const answers = await inquirer.prompt(prompts);
        finalVariables = { ...finalVariables, ...answers };
      }
    }

    // Add default values for missing non-required variables
    template.config.variables.forEach(v => {
      if (!finalVariables[v.name] && v.default !== undefined) {
        finalVariables[v.name] = v.default;
      }
    });

    // Generate the project
    const projectPath = await this.templateSystem.generateProject(templateId, {
      name: finalProjectName,
      directory,
      variables: finalVariables,
      skipInstall: params.skipInstall,
      skipGit: params.skipGit
    });

    return {
      success: true,
      data: {
        templateId,
        projectName: finalProjectName,
        projectPath,
        variables: finalVariables,
        message: `Project '${finalProjectName}' created successfully at ${projectPath}`
      }
    };
  }

  private async createTemplate(params: any): Promise<ToolResult> {
    const { projectPath, templateId, config } = params;

    if (!projectPath || !templateId || !config) {
      return {
        success: false,
        error: 'projectPath, templateId, and config are required'
      };
    }

    try {
      const template = await this.templateSystem.createTemplateFromProject(
        projectPath,
        templateId,
        config
      );

      return {
        success: true,
        data: {
          templateId: template.id,
          path: template.path,
          message: `Template '${templateId}' created successfully`
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async getTemplateInfo(params: any): Promise<ToolResult> {
    const { templateId } = params;

    if (!templateId) {
      return {
        success: false,
        error: 'Template ID is required'
      };
    }

    const template = this.templateSystem.getTemplate(templateId);
    if (!template) {
      return {
        success: false,
        error: `Template '${templateId}' not found`
      };
    }

    return {
      success: true,
      data: {
        id: template.id,
        config: template.config,
        isBuiltIn: template.isBuiltIn,
        usageCount: template.usageCount,
        createdAt: template.createdAt,
        files: Array.from(template.files.keys()),
        variables: template.config.variables.map(v => ({
          name: v.name,
          description: v.description,
          type: v.type,
          required: v.required,
          default: v.default,
          choices: v.choices
        }))
      }
    };
  }
}

export class TemplateWizardTool implements Tool {
  name = 'templateWizard';
  description = 'Interactive wizard for creating projects from templates';
  
  parameters = {
    category: {
      type: 'string' as const,
      description: 'Pre-select a category'
    },
    directory: {
      type: 'string' as const,
      description: 'Directory to create project in',
      default: '.'
    }
  };

  private templateTool: ProjectTemplateTool;

  constructor() {
    this.templateTool = new ProjectTemplateTool();
  }

  async execute(params: any): Promise<ToolResult> {
    try {
      // Get available templates
      const listResult = await this.templateTool.execute({ action: 'list' });
      if (!listResult.success || !listResult.data) {
        return listResult;
      }

      const { grouped, categories } = listResult.data;

      // Select category
      let selectedCategory = params.category;
      if (!selectedCategory) {
        const categoryAnswer = await inquirer.prompt([{
          type: 'list',
          name: 'category',
          message: 'Select project category:',
          choices: categories.map((cat: string) => ({
            name: `${cat} (${grouped[cat].length} templates)`,
            value: cat
          }))
        }]);
        selectedCategory = categoryAnswer.category;
      }

      // Select template
      const templates = grouped[selectedCategory];
      const templateAnswer = await inquirer.prompt([{
        type: 'list',
        name: 'template',
        message: 'Select a template:',
        choices: templates.map((t: any) => ({
          name: `${t.name} - ${t.description}`,
          value: t.id
        }))
      }]);

      // Get template info
      const infoResult = await this.templateTool.execute({
        action: 'info',
        templateId: templateAnswer.template
      });

      if (!infoResult.success || !infoResult.data) {
        return infoResult;
      }

      const templateInfo = infoResult.data;

      // Show template details
      console.log('\nTemplate Details:');
      console.log(`Name: ${templateInfo.config.name}`);
      console.log(`Description: ${templateInfo.config.description}`);
      console.log(`Author: ${templateInfo.config.author}`);
      console.log(`Version: ${templateInfo.config.version}`);
      console.log(`Tags: ${templateInfo.config.tags.join(', ')}`);
      console.log('\n');

      // Confirm
      const confirmAnswer = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to create a project with this template?',
        default: true
      }]);

      if (!confirmAnswer.confirm) {
        return {
          success: true,
          data: { message: 'Template generation cancelled' }
        };
      }

      // Generate project
      return await this.templateTool.execute({
        action: 'generate',
        templateId: templateAnswer.template,
        directory: params.directory,
        interactive: true
      });

    } catch (error: any) {
      return {
        success: false,
        error: `Template wizard failed: ${error.message}`
      };
    }
  }
}