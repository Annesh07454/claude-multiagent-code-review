import * as dotenv from 'dotenv';
import { mkdir } from 'node:fs/promises';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/index.js';

dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 *
 * Usage:
 * npm run dev -- <owner> <repo> <pr-number>
 * npm start <owner> <repo> <pr-number>
 */
async function main(): Promise<void> {
  const [owner, repo, prStr] = process.argv.slice(2);

  // Validate command-line arguments
  if (!owner || !repo || !prStr) {
    console.error(
      'Usage: npm run dev -- <owner> <repo> <pr-number>'
    );
    process.exit(1);
  }

  const prNumber = Number(prStr);

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    console.error('Error: pr-number must be a positive integer.');
    process.exit(1);
  }

  // Validate authentication
  const hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasAwsCredentials =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY);

  if (!hasAnthropicApiKey && !hasAwsCredentials) {
    console.error(
      'Error: Authentication is not configured.\n' +
      'Set ANTHROPIC_API_KEY, or configure AWS_ACCESS_KEY_ID ' +
      'and AWS_SECRET_ACCESS_KEY.'
    );
    process.exit(1);
  }

  if (hasAwsCredentials && !hasAnthropicApiKey) {
    if (!process.env.AWS_REGION) {
      console.error(
        'Error: AWS_REGION is required when using AWS Bedrock.'
      );
      process.exit(1);
    }

    console.log('🔐 Using AWS Bedrock authentication');
  } else {
    console.log('🔐 Using Anthropic API authentication');
  }

  // Validate model
  const model = process.env.ANTHROPIC_MODEL;

  if (!model) {
    console.error(
      'Error: ANTHROPIC_MODEL environment variable is required.'
    );
    process.exit(1);
  }

  console.log(`Reviewing ${owner}/${repo}#${prNumber}...`);

  try {
    const orchestrator = new CodeReviewOrchestrator({
      model
    });

    const report = await orchestrator.reviewPullRequest(
      owner,
      repo,
      prNumber
    );

    await mkdir('reports', { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

    const baseName = `${owner}-${repo}-pr-${prNumber}-${timestamp}`;
	const reportGenerator = new ReportGenerator();

const markdown = reportGenerator.generateMarkdownReport(report);
const html = reportGenerator.generateHTMLReport(report);
const json = reportGenerator.generateJSONReport(report);
    const { writeFile } = await import('node:fs/promises');

    await writeFile(
      `reports/${baseName}.md`,
      markdown,
      'utf8'
    );

    await writeFile(
      `reports/${baseName}.html`,
      html,
      'utf8'
    );

    await writeFile(
      `reports/${baseName}.json`,
      json,
      'utf8'
    );

    console.log('✅ Code review completed.');
    console.log(`Reports written to reports/`);
  } catch (error) {
    console.error(
      'Error:',
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  }
}

main();
