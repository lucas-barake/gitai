# AI PR Assistant (`pr-gen`)

A command-line tool that acts as a general-purpose AI assistant for your pull requests. It can automatically generate PR titles and descriptions, provide code reviews, and more, streamlining your workflow.

## Overview

This CLI tool connects to the GitHub (`gh`) CLI and a generative AI to:

1.  Detect the current repository you are in.
2.  Start an interactive session, prompting for a pull request number.
3.  Fetch the code changes (diff) for the specified PR.
4.  Ask whether you want to generate PR details (title/description) or a code review.
5.  Send the diff to a generative AI for analysis.
6.  Update the pull request on GitHub with the AI-generated content or post a review as a comment.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

1.  **[Bun](https://bun.sh/)**: The runtime used to execute the script.
2.  **[pnpm](https://pnpm.io/)**: Used for dependency management and creating the global link.
3.  **[GitHub CLI](https://cli.github.com/)**: The tool used to interact with GitHub.
    - Make sure you are authenticated by running `gh auth login`.

## Configuration

This tool requires a Google AI API key to function.

```env
GOOGLE_AI_API_KEY="your-api-key-here"
```

## Installation

Follow these steps to set up the `pr-gen` command on your local machine.

### 1\. Clone the Repository

First, clone this project to your local machine.

### 2\. Install Dependencies

Install the necessary Node.js packages using `pnpm`.

```bash
pnpm install
```

### 3\. Make the Script Executable

Grant execute permissions to the main script file. This allows the system to run it directly.

```bash
chmod +x pr-gen
```

### 4\. Create the Global Link

Use `pnpm` to create a global symbolic link to your script. This makes the `pr-gen` command available from any directory in your terminal.

```bash
pnpm link --global
```

> **Note:** If this is your first time using `pnpm` for global links, you may need to run `pnpm setup` and restart your terminal or source your shell's config file (e.g., `source ~/.zshrc`) to update your system's `PATH`.

## Usage

Once installed, you can use the `pr-gen` command from within any local Git repository directory that has a GitHub remote.

### Running the Assistant

Simply run the command without any arguments to start the interactive session.

```bash
pr-gen
```

The tool will then guide you through the process:

```
? Please enter the PR number: › 123
? What would you like to do?
❯ Generate PR details (title and description)
  Generate a review and post as a comment
```

### Getting Help

To see all available options and parameters, use the `--help` flag.

```bash
pr-gen --help
```
