import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { PlanSpec } from '@archpi/shared';

const execAsync = promisify(exec);

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.archpi']);

function safeResolve(root: string, targetPath: string): string {
  const normalizedRoot = resolve(root);
  const resolved = resolve(normalizedRoot, targetPath);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + sep)) {
    throw new Error(`Access denied: path "${targetPath}" escapes workspace root`);
  }
  return resolved;
}

export function createReadOnlyTools(projectRoot: string): AgentTool<any>[] {
  const readSchema = Type.Object({
    path: Type.String({ description: 'Relative or absolute file path within workspace' })
  });
  const readFileTool: AgentTool<typeof readSchema> = {
    name: 'read_file',
    label: 'Read File',
    description: 'Read the contents of a file in the workspace.',
    parameters: readSchema,
    execute: async (_id, params) => {
      const fullPath = safeResolve(projectRoot, params.path);
      const content = await readFile(fullPath, 'utf8');
      return {
        content: [{ type: 'text', text: content }],
        details: { path: fullPath, bytes: content.length }
      };
    }
  };

  const listDirSchema = Type.Object({
    path: Type.Optional(
      Type.String({ description: 'Directory path relative to workspace root (default ".")' })
    )
  });
  const listDirTool: AgentTool<typeof listDirSchema> = {
    name: 'list_dir',
    label: 'List Directory',
    description: 'List files and subdirectories in a workspace directory.',
    parameters: listDirSchema,
    execute: async (_id, params) => {
      const targetDir = safeResolve(projectRoot, params.path || '.');
      const entries = await readdir(targetDir, { withFileTypes: true });
      const formatted = entries
        .filter((e) => !IGNORED_DIRS.has(e.name))
        .slice(0, 200)
        .map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`)
        .join('\n');
      return {
        content: [{ type: 'text', text: formatted || '(empty directory)' }],
        details: { path: targetDir, count: entries.length }
      };
    }
  };

  const grepSchema = Type.Object({
    query: Type.String({ description: 'Substring or pattern to search for' }),
    path: Type.Optional(
      Type.String({ description: 'Optional subdirectory to limit search (default ".")' })
    )
  });
  const grepSearchTool: AgentTool<typeof grepSchema> = {
    name: 'grep_search',
    label: 'Search Code',
    description: 'Search for a text pattern across files in the workspace.',
    parameters: grepSchema,
    execute: async (_id, params) => {
      const searchRoot = safeResolve(projectRoot, params.path || '.');
      const matches: string[] = [];
      const needle = params.query.toLowerCase();

      async function walk(dir: string): Promise<void> {
        if (matches.length >= 50) return;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (matches.length >= 50) return;
          if (IGNORED_DIRS.has(entry.name)) continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.isFile()) {
            try {
              const text = await readFile(full, 'utf8');
              const lines = text.split(/\r?\n/);
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(needle)) {
                  const rel = relative(projectRoot, full).replace(/\\/g, '/');
                  matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
                  if (matches.length >= 50) break;
                }
              }
            } catch {
              // Skip unreadable or binary files
            }
          }
        }
      }

      await walk(searchRoot);
      return {
        content: [{ type: 'text', text: matches.join('\n') || '(no matches)' }],
        details: { query: params.query, matchCount: matches.length }
      };
    }
  };

  return [readFileTool, listDirTool, grepSearchTool];
}

function createBashTool(
  projectRoot: string,
  description: string,
  getTimeoutMs?: () => number
): AgentTool<any> {
  const bashSchema = Type.Object({
    command: Type.String({ description: 'Shell command to execute' })
  });
  const bashTool: AgentTool<typeof bashSchema> = {
    name: 'bash',
    label: 'Run Shell Command',
    description,
    parameters: bashSchema,
    execute: async (_id, params) => {
      const timeout = Math.max(5_000, getTimeoutMs?.() ?? 30_000);
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: projectRoot,
        timeout,
        maxBuffer: 1024 * 1024,
        windowsHide: true
      });
      const out = [stdout, stderr].filter(Boolean).join('\n');
      return {
        content: [{ type: 'text', text: out || '(no output)' }],
        details: { command: params.command }
      };
    }
  };
  return bashTool;
}

export interface WorkerBridge {
  updatePlanStep: (planId: string, stepId: string, done: boolean) => PlanSpec | undefined;
}

export function createWorkerTools(
  projectRoot: string,
  bridge?: WorkerBridge,
  getBashTimeoutMs?: () => number
): AgentTool<any>[] {
  const writeSchema = Type.Object({
    path: Type.String({ description: 'Relative or absolute file path' }),
    content: Type.String({ description: 'Full file content' })
  });
  const writeFileTool: AgentTool<typeof writeSchema> = {
    name: 'write_file',
    label: 'Write File',
    description: 'Create or overwrite a file in the workspace.',
    parameters: writeSchema,
    execute: async (_id, params) => {
      const fullPath = safeResolve(projectRoot, params.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, params.content, 'utf8');
      return {
        content: [{ type: 'text', text: `Wrote ${fullPath}` }],
        details: { path: fullPath }
      };
    }
  };

  const editSchema = Type.Object({
    path: Type.String({ description: 'Relative or absolute file path' }),
    target: Type.String({ description: 'Exact text to replace' }),
    replacement: Type.String({ description: 'Replacement text' })
  });
  const editFileTool: AgentTool<typeof editSchema> = {
    name: 'edit_file',
    label: 'Edit File',
    description: 'Replace an exact text target in an existing file.',
    parameters: editSchema,
    execute: async (_id, params) => {
      const fullPath = safeResolve(projectRoot, params.path);
      const raw = await readFile(fullPath, 'utf8');
      if (!raw.includes(params.target)) {
        throw new Error(`Target string not found in ${fullPath}`);
      }
      const updated = raw.replace(params.target, params.replacement);
      await writeFile(fullPath, updated, 'utf8');
      return {
        content: [{ type: 'text', text: `Updated ${fullPath}` }],
        details: { path: fullPath }
      };
    }
  };

  const tools: AgentTool<any>[] = [
    ...createReadOnlyTools(projectRoot),
    writeFileTool,
    editFileTool,
    createBashTool(
      projectRoot,
      'Execute a shell command in the workspace root.',
      getBashTimeoutMs
    )
  ];

  if (bridge) {
    const stepSchema = Type.Object({
      planId: Type.String({ description: 'ID of the dispatched plan' }),
      stepId: Type.String({ description: 'ID of the step (e.g. step-1)' }),
      done: Type.Optional(Type.Boolean({ description: 'Completion status (default true)' }))
    });
    const updateStepTool: AgentTool<typeof stepSchema> = {
      name: 'update_plan_step',
      label: 'Update Plan Step',
      description: 'Mark a step in the dispatched execution plan as completed or pending.',
      parameters: stepSchema,
      execute: async (_id, params) => {
        const done = params.done ?? true;
        const plan = bridge.updatePlanStep(params.planId, params.stepId, done);
        if (!plan) {
          throw new Error(`Plan ${params.planId} or step ${params.stepId} not found`);
        }
        return {
          content: [
            {
              type: 'text',
              text: `Updated ${params.planId} step ${params.stepId} -> done=${done}`
            }
          ],
          details: plan
        };
      }
    };
    tools.push(updateStepTool);
  }

  return tools;
}

export function createReviewerTools(
  projectRoot: string,
  getBashTimeoutMs?: () => number
): AgentTool<any>[] {
  return [
    ...createReadOnlyTools(projectRoot),
    createBashTool(
      projectRoot,
      'Run read-only inspection or verification commands (e.g. git diff, git status, typecheck, tests). Do not modify source files.',
      getBashTimeoutMs
    )
  ];
}

export interface OrchestratorBridge {
  listAliveWindows: (projectId: string) => Array<{
    id: string;
    title: string;
    role: string;
    status: string;
    branch: string;
    inboxCount: number;
  }>;
  createWorker: (input: {
    projectId: string;
    title: string;
    branch?: string;
  }) => Promise<{
    id: string;
    title: string;
    role: string;
    status: string;
    branch: string;
  }>;
  createPlan: (
    orchestratorWindowId: string,
    plan: Omit<PlanSpec, 'id' | 'projectId' | 'sourceOrchestratorId' | 'status' | 'createdAt'>
  ) => PlanSpec;
  dispatchPlanById: (
    planId: string,
    targetWorkerId: string,
    targetReviewerId?: string
  ) => Promise<void>;
  requestReview: (input: {
    planId: string;
    workerWindowId: string;
    reviewerWindowId: string;
    summary?: string;
  }) => Promise<void>;
}

export function createOrchestratorTools(
  projectRoot: string,
  projectId: string,
  orchestratorWindowId: string,
  bridge: OrchestratorBridge
): AgentTool<any>[] {
  const listSchema = Type.Object({});
  const listAliveTool: AgentTool<typeof listSchema> = {
    name: 'list_alive_windows',
    label: 'List Alive Windows',
    description:
      'List all currently alive conversation windows (master, worker) in the project.',
    parameters: listSchema,
    execute: async () => {
      const list = bridge.listAliveWindows(projectId);
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
        details: list
      };
    }
  };

  const createPlanSchema = Type.Object({
    title: Type.String({ description: 'Short plan title' }),
    summary: Type.String({ description: 'Overview of the plan' }),
    steps: Type.Array(
      Type.Object({
        title: Type.String(),
        detail: Type.String()
      })
    ),
    acceptanceCriteria: Type.Array(Type.String()),
    targetWorkerId: Type.Optional(Type.String()),
    targetReviewerId: Type.Optional(Type.String())
  });
  const createPlanTool: AgentTool<typeof createPlanSchema> = {
    name: 'create_plan',
    label: 'Create Plan',
    description:
      'Create a structured execution plan card that can be dispatched to a Worker window.',
    parameters: createPlanSchema,
    execute: async (_id, params) => {
      const plan = bridge.createPlan(orchestratorWindowId, {
        title: params.title,
        summary: params.summary,
        steps: params.steps.map((s, idx) => ({
          id: `step-${idx + 1}`,
          title: s.title,
          detail: s.detail,
          done: false
        })),
        acceptanceCriteria: params.acceptanceCriteria,
        targetWorkerId: params.targetWorkerId,
        targetReviewerId: params.targetReviewerId
      });
      return {
        content: [{ type: 'text', text: `Plan created with id ${plan.id}` }],
        details: plan
      };
    }
  };

  const createWorkerSchema = Type.Object({
    title: Type.String({ description: 'Short descriptive title for the new Worker window' }),
    branch: Type.Optional(Type.String({ description: 'Optional git branch name' }))
  });
  const createWorkerTool: AgentTool<typeof createWorkerSchema> = {
    name: 'create_worker',
    label: 'Create Worker Window',
    description:
      'Spawn a new Worker window in the project when no suitable existing Worker can be reused.',
    parameters: createWorkerSchema,
    execute: async (_id, params) => {
      const worker = await bridge.createWorker({
        projectId,
        title: params.title,
        branch: params.branch
      });
      return {
        content: [
          {
            type: 'text',
            text: `Created new Worker window "${worker.title}" with id ${worker.id}`
          }
        ],
        details: worker
      };
    }
  };

  const dispatchSchema = Type.Object({
    planId: Type.String({ description: 'ID of the plan created via create_plan' }),
    targetWorkerId: Type.Optional(
      Type.String({
        description:
          'ID of an existing alive Worker window to reuse. Omit if creating a new Worker with newWorkerTitle.'
      })
    ),
    newWorkerTitle: Type.Optional(
      Type.String({
        description:
          'If provided (and targetWorkerId is omitted), creates a new Worker window with this title and dispatches the plan to it.'
      })
    ),
    targetReviewerId: Type.Optional(
      Type.String({ description: 'Optional Reviewer window ID for auto-review' })
    )
  });
  const dispatchPlanTool: AgentTool<typeof dispatchSchema> = {
    name: 'dispatch_plan',
    label: 'Dispatch Plan to Worker',
    description:
      'Send a created plan to an existing Worker window (targetWorkerId) or create a new Worker window (newWorkerTitle) and execute it.',
    parameters: dispatchSchema,
    execute: async (_id, params) => {
      let workerId = params.targetWorkerId?.trim();
      if (!workerId || workerId === 'new') {
        const created = await bridge.createWorker({
          projectId,
          title: params.newWorkerTitle?.trim() || 'Worker'
        });
        workerId = created.id;
      }
      await bridge.dispatchPlanById(params.planId, workerId, params.targetReviewerId);
      return {
        content: [
          {
            type: 'text',
            text: `Dispatched plan ${params.planId} to worker ${workerId}`
          }
        ],
        details: { ...params, targetWorkerId: workerId }
      };
    }
  };

  return [
    ...createReadOnlyTools(projectRoot),
    listAliveTool,
    createWorkerTool,
    createPlanTool,
    dispatchPlanTool
  ];
}
