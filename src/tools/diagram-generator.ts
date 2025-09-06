import { Tool, ToolResult } from './base.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

export class DiagramGeneratorTool implements Tool {
  name = 'generateDiagram';
  description = 'Generate diagrams from text descriptions using Mermaid or PlantUML';

  async execute(params: {
    type: 'mermaid' | 'plantuml';
    code: string;
    outputPath?: string;
    format?: 'svg' | 'png' | 'pdf';
  }): Promise<ToolResult> {
    const { type, code, outputPath, format = 'svg' } = params;
    
    try {
      let result: string;
      switch (type) {
        case 'mermaid':
          result = await this.generateMermaidDiagram(code, outputPath, format);
          break;
        case 'plantuml':
          result = await this.generatePlantUMLDiagram(code, outputPath, format);
          break;
        default:
          throw new Error(`Unsupported diagram type: ${type}`);
      }
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate diagram: ${(error as Error).message}`
      };
    }
  }

  private async generateMermaidDiagram(
    code: string, 
    outputPath?: string, 
    format: string = 'svg'
  ): Promise<string> {
    const tempFile = `temp_mermaid_${Date.now()}.mmd`;
    const outputFile = outputPath || `diagram_${Date.now()}.${format}`;
    
    try {
      // Write mermaid code to temp file
      await fs.writeFile(tempFile, code);
      
      // Check if mermaid-cli is installed
      try {
        await exec('mmdc --version');
      } catch {
        // Install mermaid-cli if not present
        console.log('Installing mermaid-cli...');
        await exec('npm install -g @mermaid-js/mermaid-cli');
      }
      
      // Generate diagram
      await exec(`mmdc -i ${tempFile} -o ${outputFile} -t dark -b transparent`);
      
      // Clean up temp file
      await fs.unlink(tempFile);
      
      return `Diagram generated: ${outputFile}`;
    } catch (error) {
      // Clean up on error
      try { await fs.unlink(tempFile); } catch {}
      throw error;
    }
  }

  private async generatePlantUMLDiagram(
    code: string,
    outputPath?: string,
    format: string = 'svg'
  ): Promise<string> {
    const tempFile = `temp_plantuml_${Date.now()}.puml`;
    const outputFile = outputPath || `diagram_${Date.now()}.${format}`;
    
    try {
      // Add PlantUML wrapper if not present
      const fullCode = code.startsWith('@startuml') ? code : `@startuml\n${code}\n@enduml`;
      
      // Write PlantUML code to temp file
      await fs.writeFile(tempFile, fullCode);
      
      // Check if PlantUML is available
      try {
        await exec('plantuml -version');
      } catch {
        throw new Error('PlantUML is not installed. Please install it first.');
      }
      
      // Generate diagram
      await exec(`plantuml -t${format} ${tempFile} -o ${path.dirname(outputFile)}`);
      
      // Rename output file to desired name
      const generatedFile = tempFile.replace('.puml', `.${format}`);
      if (generatedFile !== outputFile) {
        await fs.rename(generatedFile, outputFile);
      }
      
      // Clean up temp file
      await fs.unlink(tempFile);
      
      return `Diagram generated: ${outputFile}`;
    } catch (error) {
      // Clean up on error
      try { await fs.unlink(tempFile); } catch {}
      throw error;
    }
  }

  getParameterSchema() {
    return {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['mermaid', 'plantuml'],
          description: 'Type of diagram to generate'
        },
        code: {
          type: 'string',
          description: 'Diagram code in Mermaid or PlantUML syntax'
        },
        outputPath: {
          type: 'string',
          description: 'Output file path (optional)'
        },
        format: {
          type: 'string',
          enum: ['svg', 'png', 'pdf'],
          description: 'Output format (default: svg)'
        }
      },
      required: ['type', 'code']
    };
  }
}

// Convenience function to create diagrams from natural language
export async function createDiagramFromDescription(description: string, type: 'mermaid' | 'plantuml' = 'mermaid'): Promise<string> {
  const diagramCode = convertDescriptionToDiagram(description, type);
  const tool = new DiagramGeneratorTool();
  const result = await tool.execute({ type, code: diagramCode });
  if (result.success) {
    return result.data as string;
  } else {
    throw new Error(result.error || 'Failed to create diagram');
  }
}

// Convert natural language to diagram code
function convertDescriptionToDiagram(description: string, type: 'mermaid' | 'plantuml'): string {
  const lowerDesc = description.toLowerCase();
  
  if (type === 'mermaid') {
    // Flow diagram patterns
    if (lowerDesc.includes('flow') || lowerDesc.includes('process')) {
      return generateMermaidFlowDiagram(description);
    }
    // Sequence diagram patterns
    if (lowerDesc.includes('sequence') || lowerDesc.includes('interaction')) {
      return generateMermaidSequenceDiagram(description);
    }
    // Class diagram patterns
    if (lowerDesc.includes('class') || lowerDesc.includes('structure')) {
      return generateMermaidClassDiagram(description);
    }
    // Default to flowchart
    return generateMermaidFlowDiagram(description);
  } else {
    // PlantUML equivalents
    if (lowerDesc.includes('sequence')) {
      return generatePlantUMLSequenceDiagram(description);
    }
    if (lowerDesc.includes('class')) {
      return generatePlantUMLClassDiagram(description);
    }
    return generatePlantUMLActivityDiagram(description);
  }
}

// Example generators (simplified)
function generateMermaidFlowDiagram(description: string): string {
  return `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`;
}

function generateMermaidSequenceDiagram(description: string): string {
  return `sequenceDiagram
    participant User
    participant System
    participant Database
    
    User->>System: Request
    System->>Database: Query
    Database-->>System: Response
    System-->>User: Result`;
}

function generateMermaidClassDiagram(description: string): string {
  return `classDiagram
    class User {
        +String name
        +String email
        +login()
        +logout()
    }
    class Order {
        +String id
        +Date date
        +calculate()
    }
    User "1" --> "*" Order : places`;
}

function generatePlantUMLSequenceDiagram(description: string): string {
  return `@startuml
!theme dark

User -> System: Request
System -> Database: Query
Database --> System: Response
System --> User: Result
@enduml`;
}

function generatePlantUMLClassDiagram(description: string): string {
  return `@startuml
!theme dark

class User {
    -name: String
    -email: String
    +login()
    +logout()
}

class Order {
    -id: String
    -date: Date
    +calculate()
}

User "1" --> "*" Order : places
@enduml`;
}

function generatePlantUMLActivityDiagram(description: string): string {
  return `@startuml
!theme dark

start
:Input Data;
if (Valid?) then (yes)
    :Process Data;
    :Save Results;
else (no)
    :Show Error;
endif
stop
@enduml`;
}

// Export the tool
export const diagramGeneratorTool = new DiagramGeneratorTool();