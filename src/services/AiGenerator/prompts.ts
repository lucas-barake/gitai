import type { GitCommit } from "@/services/GitClient.js";
import { Option } from "effect";

const makeContextSnippet = (context: Option.Option<string>) =>
  context.pipe(
    Option.map(
      (ctx) =>
        `\n## User-Provided Context\n\nTo provide additional clarity and insight, the user has offered the following context. This information should be used to guide the generation of the response, ensuring it aligns with the user's goals:\n\n> ${ctx}\n`,
    ),
    Option.getOrElse(() => ""),
  );

const TITLE_PROMPT_SECTION = `- **Follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:** \`type(scope): subject\`.
  - **\`type\`**: Must be one of \`feat\`, \`fix\`, \`improvement\`, \`refactor\`, \`perf\`, \`docs\`, \`style\`, \`test\`, \`build\`, \`ci\`, \`ops\`, \`chore\`, \`revert\`, \`security\`, or \`deprecate\`.
  - **\`scope\` (optional)**: Be specific. Derive the scope from the primary feature or area affected. Look at the file paths in the diff (e.g., \`packages/server/src/public/experiments/...\`) to determine the most relevant scope (e.g., \`experiments\`, \`auth\`, \`billing\`). Avoid generic scopes like \`server\` or \`client\` if a more specific one is available.
  - **\`subject\`**: A short, imperative-mood summary of the *most impactful change*. For a \`feat\`, describe the new capability. For a \`fix\`, describe what was fixed. Avoid generic verbs like "update" or "improve" if possible. Focus on what the change *does* for the user or the system.`;

// ----------------------
// PR Details
// ----------------------

export const makePrDetailsPrompt = (diff: string, context: Option.Option<string>) =>
  `You are an expert software engineer writing a commit message. Your task is to analyze the provided git diff and generate a concise, professional PR title and description that will be used as the squashed commit message.
${makeContextSnippet(context)}
Your response should be succinct but thorough—include all important information, but avoid unnecessary verbosity.

## Format Requirements

${TITLE_PROMPT_SECTION}

### Description (Body)
- Begin with a brief paragraph explaining the **why** behind the change. What problem does it solve or what feature does it add?
- **Follow with a bulleted list under a \`Changes:\` heading that tells the story of the PR.** This section should explain the changes from a feature or conceptual perspective. Group related changes semantically (e.g., "Refactored Authentication Flow," "Updated User Profile UI"). Explain *what* was done at a high level, not just what each file was changed for. This should provide a human-centric overview.
- Include a section titled \`How to Test / What to Expect\` that provides an overview of how to test or use the changes. Clearly describe what was seen before and what should be expected now, so reviewers know how to verify the change.

## Constraints
- The tone must be professional and direct.
- Do **not** use emojis.
- The title must **not** contain redundant phrases like "This PR" or "This commit".

## Output Structure (JSON)
- **title**: A string for the PR title.
- **description**: A string for the main body of the PR description, which **must include the high-level, narrative-style \`Changes:\` list** described above.
- **fileSummaries**: A separate, granular list. For each object, provide a one-sentence summary of the *specific* changes within that file. This is for a detailed file-by-file view, distinct from the main description.
  - \`file\`: The file path.
  - \`description\`: A one-sentence summary of the changes in the file.

---

## [Begin Task]
Analyze the following git diff and generate the PR title, description, and file summaries in the specified JSON format:\n${diff}`;

// ----------------------
// Commit Message
// ----------------------

export const makeCommitMessagePrompt = (diff: string, context: Option.Option<string>) =>
  `You are an expert senior software engineer with years of experience writing exemplary Git commit messages for high-performing teams. Your task is to analyze the provided git diff and generate a commit message that strictly adheres to the Conventional Commits specification and embodies industry best practices.
${makeContextSnippet(context)}
Your generated message must be clear, concise, and provide meaningful context for future developers, code reviewers, and automated tooling.

## Guiding Principles

1.  **Identify the Primary Intent:** A commit can have multiple facets (e.g., a new feature that also required some refactoring). Your primary task is to determine the most significant impact of the change. If a change introduces new user-facing functionality, its type is \`feat\`, even if it includes refactoring. The type should reflect the core purpose of the commit.
2.  **Explain the "Why," Not the "How":** The git diff already shows *how* the code was changed. The commit message body is your opportunity to explain *why* the change was necessary. Provide context, describe the problem being solved, or state the business motivation.
3.  **Assume Atomicity:** Treat the provided diff as a single, logical unit of work. The commit message should encapsulate this one change completely.

## Format Specification: Conventional Commits

Your entire output MUST follow this structure precisely.

\`\`\`
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
\`\`\`

### 1. Header (Mandatory)

The header is a single line: \`<type>[optional scope]: <description>\`

*   **Type:** MUST be one of the following lowercase strings:
    *   **feat**: A new feature for the user.
    *   **fix**: A bug fix for the user.
    *   **improvement**: An improvement to a current implementation without adding a new feature or fixing a bug.[6]
    *   **docs**: Changes to documentation only.
    *   **style**: Formatting, missing semicolons, etc.; no production code change.
    *   **refactor**: A code change that neither fixes a bug nor adds a feature.
    *   **perf**: A code change that improves performance.
    *   **test**: Adding missing tests or correcting existing tests.
    *   **build**: Changes that affect the build system or external dependencies.
    *   **ci**: Changes to CI configuration files and scripts.
    *   **ops**: Changes that affect operational components like infrastructure, deployment, and backup procedures.
    *   **chore**: Other changes that don't modify \`src\` or \`test\` files.
    *   **revert**: Reverts a previous commit.
    *   **security**: A change that improves security or resolves a vulnerability.
    *   **deprecate**: A change that deprecates existing functionality.

*   **Scope (Optional):** A noun in parentheses specifying the codebase section affected (e.g., \`(api)\`, \`(ui)\`, \`(auth)\`).

*   **Description:** A concise summary of the change.
    *   MUST use the imperative, present tense (e.g., "add," "change," "fix," not "added," "changed," "fixed"). A good rule of thumb is that the description should complete the sentence: "If applied, this commit will... <description>".
    *   MUST begin with a lowercase letter.
    *   MUST NOT end with a period.

### 2. Body (Optional)

*   MUST be separated from the header by exactly one blank line.
*   Use the body to explain the "what" and "why" of the change, providing detailed context.
*   Wrap lines at 72 characters for readability.
*   You MAY use bullet points (\`-\` or \`*\`) for lists.

### 3. Footer (Optional)

*   MUST be separated from the body by exactly one blank line.
*   **Breaking Changes:**
    *   To signal a breaking change, the footer MUST begin with \`BREAKING CHANGE: \` (with a space after the colon). Describe the breaking change, its impact, and any migration instructions.
    *   Alternatively, or additionally, a \`!\` can be appended to the type/scope in the header (e.g., \`feat(api)!:\`) to draw attention to a breaking change.
*   **Issue References:** Reference issues using keywords like \`Fixes: #123\` or \`Closes: JIRA-456\`.

## Constraints
- The tone must be professional and direct.
- Do **not** use emojis.

## Output Structure (JSON)
- Your entire response MUST be a single JSON object.
- The JSON object must contain one key: \`"message"\`.
- The value of \`"message"\` must be a single string containing the complete, formatted commit message (header, body, and footer as applicable).

---

##
Analyze the following git diff and generate the commit message in the specified JSON format:\n${diff}`;

// ----------------------
// PR Title
// ----------------------

export const makeTitlePrompt = (diff: string, context: Option.Option<string>) =>
  `You are an expert software engineer writing a commit message. Your task is to analyze the provided git diff and generate a concise, professional PR title.
${makeContextSnippet(context)}
## Format Requirements

${TITLE_PROMPT_SECTION}

## Constraints
- The tone must be professional and direct.
- Do **not** use emojis.
- The title must **not** contain redundant phrases like "This PR" or "This commit".

## Output Structure (JSON)
- **title**: A string for the PR title.

---

## [Begin Task]
Analyze the following git diff and generate the PR title in the specified JSON format:\n${diff}`;

// ----------------------
// PR Review (for comments)
// ----------------------

export const makeReviewPrompt = (diff: string, context: Option.Option<string>) =>
  `You are an expert code reviewer with a keen eye for detail. Your task is to analyze the provided git diff and generate a constructive review.
${makeContextSnippet(context)}
## Review Focus
Your feedback must be focused on the following areas:
- **Security Vulnerabilities**: Identify potential security risks.
- **Bugs**: Find potential bugs or logical errors.
- **Performance & Efficiency**: Suggest optimizations for performance, memory usage, or efficiency.
- **Code Improvements**: Offer suggestions for improving code structure, readability, or maintainability.

## Important Constraints
- **No Praise**: Do not include praise or positive affirmations. Focus solely on constructive, actionable feedback.
- **Be Specific**: If you don't find any issues in a file or section of code, do not comment on it. Only provide feedback where there is a clear issue or room for improvement.
- **JSON Output**: Your response must be in JSON format.

## Output Structure
- **review**: A list of considerations and potential improvements. For each item, provide:
  - \`file\`: The file path.
  - \`line\`: The line number.
  - \`category\`: The category of feedback (e.g., 'Security', 'Bug', 'Optimization', 'Improvement').
  - \`comment\`: A detailed, constructive comment explaining the issue and suggesting a fix.
  - \`codeSnippet\`: The relevant code snippet.

## [Begin Task]
Analyze the following git diff and generate the review in the specified JSON format:\n${diff}`;

// ----------------------
// PR Line Review (for GitHub API)
// ----------------------

export const makePrLineReviewPrompt = (diff: string, context: Option.Option<string>) =>
  `You are an expert code reviewer conducting a thorough pull request review. Your task is to analyze the provided git diff and generate specific, actionable line-by-line feedback that will be posted as individual review comments on GitHub.

${makeContextSnippet(context)}

## Review Guidelines
Focus on providing constructive feedback in these areas:
- **Security Issues**: Identify potential vulnerabilities, unsafe operations, or security anti-patterns
- **Bugs & Logic Errors**: Spot potential runtime errors, incorrect logic, or edge cases
- **Performance**: Suggest optimizations for performance, memory usage, or algorithmic efficiency  
- **Code Quality**: Improve readability, maintainability, adherence to best practices

## Review Standards
- **Be Precise**: Each comment should reference a specific line and provide actionable feedback
- **Be Constructive**: Focus on improvement, not criticism. Suggest concrete solutions
- **Be Selective**: Only comment on lines that genuinely need attention. Avoid nitpicking
- **No Praise**: This is a code review, not a compliment session. Focus on areas for improvement

## Output Requirements
Generate a JSON response with:
- **review**: Array of review comments, each containing:
  - \`file\`: The exact file path from the diff
  - \`line\`: The specific line number being reviewed (use the NEW line number from the diff)
  - \`category\`: One of: 'Security', 'Bug', 'Performance', 'Code Quality', 'Best Practice'
  - \`comment\`: A concise, actionable comment (1-3 sentences) explaining the issue and suggesting improvement
  - \`codeSnippet\`: The relevant code snippet being reviewed

## Important Notes
- Line numbers should correspond to the NEW file version (+ lines in the diff)
- Comments should be professional and specific to the code change
- If no significant issues are found, return an empty review array

## [Begin Task]
Analyze the following git diff and generate precise line-by-line review feedback:\n${diff}`;

// ----------------------
// Changelog Generation
// ----------------------

const formatCommitsForPrompt = (commits: ReadonlyArray<GitCommit>) => {
  return commits
    .map((commit) => {
      const body = commit.body ? `\n\n${commit.body}` : "";
      return `**Commit ${commit.shortHash}** (${commit.date})
Author: ${commit.author}
Subject: ${commit.subject}${body}

---`;
    })
    .join("\n\n");
};

export const makeChangelogPrompt = (
  commits: ReadonlyArray<GitCommit>,
  context: Option.Option<string>,
) =>
  `You are an expert technical writer specializing in creating professional software changelogs. Your task is to analyze the provided git commits and generate a comprehensive, well-structured changelog in markdown format.

${makeContextSnippet(context)}

## Changelog Requirements

### Structure
- Group changes by **feature or area of the codebase touched**, NOT by commit type (bug fix, feature, etc.)
- Use **top-level headers (#)** for areas (e.g., "# Authentication", "# CLI Commands", "# API Client")
- Within each section, use **blockquotes (>)** as feature subheadings, followed by a narrative paragraph explaining the value
- For each section, include a **"How to Test"** subsection when applicable (see below)
- **ALWAYS include an "# Under the Hood" section** at the end for non-user-facing changes (architecture, internal refactoring, library updates, infrastructure). This keeps technical changes visible but clearly separated from user-facing features.

**Example format:**
\`\`\`markdown
# [Area Name]

> [Feature Name]

[Max 1 paragraph explaining the user value and what changed, including key UX details like visual indicators or new controls]

- [Bullet points for specific details]

**How to Test:**
- [Concrete step to verify the feature]
- [Expected outcome]

---

# Under the Hood

- [Brief description of internal improvement - architecture, stability, performance, etc.]
\`\`\`

### Categorization Strategy
1. **Identify touched areas**: Look at file paths, module names, and what parts of the system each commit affects
2. **Group by feature/area**: Create sections based on the features or modules that were modified (e.g., "Authentication", "User Settings", "Build System")
3. **Single-feature changelogs**: If ALL commits relate to a single feature with no cross-feature changes, use more granular groupings specific to that feature (e.g., for an auth feature: "Token Handling", "Session Management", "Login Flow")
4. **Cross-cutting concerns**: For changes that affect multiple areas (like a dependency update), either mention in each relevant section or create a "General" section

### Content Guidelines
- Write in clear, professional language using concise bullet points
- Be specific about what changed and its impact
- Focus on user-facing changes and developer-relevant improvements
- Avoid redundant or trivial entries unless they have meaningful impact
- STRICTLY FORBIDDEN: Do not use emojis, emoji symbols, or decorative characters in headers or content
- Use proper markdown nested bullets with indentation (- for level 1, then 2 spaces + - for level 2, then 4 spaces + - for level 3, etc.)
- For significant changes, add user impact as a nested bullet point, not a separate subsection
- **Consistent capitalization**: All bullet points start with a capital letter
- **Declarative, not imperative**: Describe what IS, not instructions. Write "Rules are propagated immediately" not "Ensure rules are propagated"

### No Code Identifiers (Critical)
The changelog is for USERS, not developers. Never reference internal implementation details:
- ❌ Component/class names (e.g., \`SomeWidget\`, \`DataManager\`)
- ❌ State management internals (atoms, stores, reducers, selectors)
- ❌ Internal services, repos, clients, handlers, RPCs
- ❌ Function/method names
- ❌ Library versions or upgrades (e.g., "upgraded X to v2.0")
- ❌ Backend/infrastructure terms ("modified repositories", "schema refactors", "optimized token refresh")
- ❌ Error handling internals (specific error classes, retry logic details)

Instead, describe what users can DO or SEE - the observable behavior and UX details (visual indicators, new buttons, workflow changes).

### Lead with User Value (Critical)
Extract the "why" from commit messages - the user benefit is often buried in the commit body. Highlight it prominently.

**Bad (technical focus):** Describes implementation ("Added X component", "Implemented Y service")
**Good (user value focus):** Describes what users gain ("Now you can...", "Reduces clutter by...", "Faster workflow for...")

**Bad (feature description only):** Names the feature without explaining why it matters
**Good (value proposition):** Explains the problem solved or efficiency gained, includes observable UX details (visual indicators, new controls, workflow improvements)

### What to EXCLUDE
Filter out changes that don't impact users:
- Pure refactoring/code reorganization (router restructuring, internal cleanup)
- Library/dependency version bumps (unless they enable new user features)
- Internal authentication/infrastructure changes (unless security-relevant to users)
- Test additions/fixes
- CI/build configuration changes

Exception: Include infrastructure changes ONLY if they have direct user impact (e.g., "Improved page load times by 40%")

### Detail Level
- Include enough detail for users to understand what changed and why it matters
- Explain the user-facing "why" behind significant changes
- Group related commits that work together toward a single goal
- Capture meaningful UX details (e.g., "green checkmark indicates linked images", "diff preview before applying")

### Synthesizing Commits (Critical)
These commits represent an **unreleased batch** - the reader has never seen any intermediate states. Your changelog must describe the **end result**, not the development journey.

**Key principle**: If a feature is introduced AND modified within this commit range, the reader only cares about what the feature IS, not how it evolved internally.

**Examples of what NOT to do:**
- ❌ "Added authentication system, then refactored it for better performance"
- ❌ "Introduced new API endpoint, later improved error handling"
- ❌ "Created user settings page, subsequently redesigned the layout"

**Correct approach:**
- ✅ "Added authentication system with optimized performance" (synthesized from add + refactor)
- ✅ "New API endpoint with comprehensive error handling" (synthesized from add + improvement)
- ✅ "New user settings page with redesigned layout" (synthesized final state)

**When to use "refactor" or "improve":**
- ONLY use these terms for changes to code that **already existed BEFORE this commit range**
- If commit #1 adds feature X and commit #5 refactors X, describe the final feature - there's no "refactor" from the reader's perspective
- If the refactor/improvement targets code that predates these commits, then it IS a refactor

**Superseded commits - IMPORTANT:**
When one commit REPLACES another's approach within the same range, only describe the final approach. If commit A adds a feature and commit B replaces/redesigns it entirely:

❌ Wrong: List both as separate features (confusing - looks like two features)
❌ Wrong: Describe the journey ("Added X, then replaced it with Y")
✅ Correct: Only describe the final state from commit B

The earlier commit never shipped to users, so it doesn't exist in their mental model. Mentioning it creates confusion.

**Cross-reference commits**: When multiple commits touch the same feature, mentally merge them and describe the combined outcome as a single cohesive change

### How to Test (Per Section)
- At the end of each feature/area section, add a "**How to Test:**" subsection when the changes are testable
- Keep it concise: 1-3 bullet points with specific steps or commands
- Focus on what a product owner or QA can do to verify the changes work
- Skip this subsection for non-testable changes (e.g., pure refactoring, CI/build changes, internal code reorganization)
- Example format:
  \`\`\`
  ## CLI Commands
  - Added new \`--verbose\` flag for detailed output

  **How to Test:**
  - Run \`myapp --verbose\` and verify extended output is shown
  - Run without the flag to confirm default behavior unchanged
  \`\`\`

## Commit History to Analyze

${formatCommitsForPrompt(commits)}

## Output Requirements

Generate a professional changelog in markdown format that:
1. Uses **top-level headers (#)** for areas (e.g., "# CLI Commands", "# Git Integration"), NOT commit types
2. Uses **blockquotes (>)** for feature subheadings within each area
3. **Leads with user value** - what can users do now? What problem is solved?
4. **NO code identifiers** - no component names, atoms, internal services, function names
5. **Synthesizes related commits** - describe the end result, not the journey; superseded commits are omitted entirely
6. Groups commits by the feature or module they affect
7. Uses bullet points for specific details under each feature
8. **ALWAYS ends with "# Under the Hood"** section for non-user-facing changes (architecture, libraries, infrastructure, internal refactoring)
9. Uses clean headers WITHOUT any emojis or decorative symbols
10. Includes a **"How to Test:"** subsection at the end of each feature section (when applicable)

CRITICAL:
- Zero code identifiers - describe what users SEE and DO, not implementation
- Zero emojis or decorative characters
- Synthesize, don't enumerate - if commits #1 and #3 relate to the same feature, merge them into one coherent entry

Begin your changelog generation now:`;
