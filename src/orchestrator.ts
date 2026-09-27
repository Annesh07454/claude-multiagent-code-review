import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents/index.js';

import { mcpServersConfig } from './config/mcp.config.js';
import { buildOrchestratorPrompt } from './prompts/index.js';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema
} from './types/report-types.js';
import type { ReviewReport } from './types/report-types.js';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
}

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  private readonly options: OrchestratorOptions;

  constructor(options: OrchestratorOptions = {}) {
    this.options = options;
  }

  /**
   * Review a pull request using parallel subagent analysis
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startTime = Date.now();

    const agents: Record<string, AgentDefinition> = {
      codeQualityAnalyzer,
      testCoverageAnalyzer,
      refactoringSuggester
    };

    const prompt = buildOrchestratorPrompt(owner, repo, prNumber);

    const response = query({
      prompt,
      options: {
        model: this.options.model || process.env.ANTHROPIC_MODEL,
        maxTurns: this.options.maxTurns || 30,
        agents,
        mcpServers: mcpServersConfig,
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema
        }
      }
    });

    for await (const message of response) {
      if (message.type !== 'result') {
        continue;
      }

      if (message.subtype !== 'success') {
        const errors = 'errors' in message ? message.errors : [];
        throw new Error(
          `Code review failed: ${errors.join('; ') || message.subtype}`
        );
      }

      if (message.structured_output === undefined) {
  console.error('DEBUG RESULT:', JSON.stringify(message, null, 2));
  throw new Error('Code review returned no structured output');
}

      const result = ReviewReportSchema.parse(message.structured_output);

      return {
        ...result,
        pullRequest: {
          owner,
          repo,
          number: prNumber
        },
        metadata: {
          ...result.metadata,
          analyzedAt: result.metadata?.analyzedAt || new Date().toISOString(),
          duration: Date.now() - startTime,
          agentVersions: {
            codeQualityAnalyzer: '1.0.0',
            testCoverageAnalyzer: '1.0.0',
            refactoringSuggester: '1.0.0'
          }
        }
      };
    }

    throw new Error('Code review completed without a result');
  }
}
