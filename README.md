# AI Git Assistant (`gitai`)

A command-line tool that acts as a general-purpose AI assistant for your git workflow. It can automatically generate PR titles and descriptions, provide code reviews, generate commit messages, and more, streamlining your workflow.

## Overview

This CLI tool connects to the GitHub (`gh`) CLI and a generative AI to perform two main functions:

1.  **GitHub Interaction (`gh` subcommand):**
    - Detects the current repository you are in.
    - Starts an interactive session, prompting for a pull request number.
    - Fetches the code changes (diff) for the specified PR.
    - Asks whether you want to generate PR details (title/description) or a code review.
    - Sends the diff to a generative AI for analysis.
    - Updates the pull request on GitHub with the AI-generated content or posts a review as a comment.

2.  **Commit Message Generation (`commit` subcommand):**
    - Gets the staged diff from your local git repository.
    - Sends the diff to a generative AI to generate a conventional commit message.
    - Prompts for confirmation before committing the changes with the generated message.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

1.  **[GitHub CLI](https://cli.github.com/)**: The tool used to interact with GitHub.
    - Make sure you are authenticated by running `gh auth login`.
2.  **[Google AI API](https://ai.google.dev/gemini-api/docs/api-key)**: The API key used to interact with the AI.

## Configuration

This tool requires a Google AI API key to function. You must set the `GOOGLE_AI_API_KEY` environment variable for the application to work.

### Basic Setup (for testing)

You can export the variable in your shell. Note that this is not the most secure method for long-term use.

```bash
export GOOGLE_AI_API_KEY="your-api-key-here"
```

To make it persist between sessions, you can add this line to your shell's configuration file (e.g., `~/.zshrc`, `~/.bashrc`).

### Recommended: Using a Secret Manager

For better security, it is highly recommended to use a secret manager to handle your API key. This prevents storing secrets in plain text.

The application will automatically read the environment variable if it's provided by a secret manager's CLI.

**Example with Bitwarden CLI:**

```bash
# The `bw run` command injects the secret into the command's environment
bw run -- gitai gh
```

**Example with Doppler:**

```bash
# The `doppler run` command works similarly
doppler run -- gitai commit
```

Using this wrapper pattern is the most secure way to provide credentials to the application.

## Installation

We recommend using [Nix](https://nixos.org/) and [direnv](https://direnv.net/) for an easy and reproducible setup. This project provides a `flake.nix` and `.envrc` for seamless development environment configuration.

### 1. Install Nix and direnv

- [Install Nix](https://nixos.org/download.html) if you haven't already.
- [Install direnv](https://direnv.net/docs/installation.html) and hook it into your shell (see direnv docs for your shell).

### 2. Allow direnv in the Project Directory

After cloning the repository, run:

```bash
direnv allow
```

This will automatically set up the development environment using Nix, as defined in `flake.nix` and `.envrc`.

### 3. Install Dependencies

With the environment active, install the necessary packages using Bun:

```bash
bun install
```

### 4. Build the Binary

Run the build script to compile the application into a single executable file:

```bash
bun run build
```

This will create a `gitai` executable in the project root.

### 5. Link the Binary for Global Access

To use the `gitai` command from anywhere, create a symbolic link from the compiled binary to a directory in your system's `PATH`. For example:

```bash
ln -s "$(pwd)/gitai" /usr/local/bin/gitai
```

> **Note:** You might need to use `sudo` to create the link in `/usr/local/bin` depending on your system's permissions. If a file already exists at that location, you may need to remove it first.

Once linked, you can run `gitai` from any directory.

## Usage

Once installed, you can use the `gitai` command from within any local Git repository directory that has a GitHub remote.

### GitHub Assistant (`gh`)

Run the `gh` subcommand to start an interactive session for PR-related tasks.

```bash
gitai gh
```

The tool will then guide you through the process:

```
? Please enter the PR number: › 123
? What would you like to do?
❯ Generate title and description
  Generate title only
  Generate a review and post as a comment
```

### Commit Message Generator (`commit`)

Run the `commit` subcommand to generate a commit message for your staged changes.

```bash
gitai commit
```

The tool will analyze your staged changes, generate a message, and ask for confirmation before committing.

```
Generated commit message:

feat(cli): add commit message generation

- Adds a new `commit` subcommand to generate commit messages from staged changes.
- Implements a `GitClient` to interact with git.
- Updates the AI generator to create commit messages.

? Would you like to commit with this message? › yes
✅ Successfully committed changes!
```

## Development

For local development, you can run the tool directly from its source code without needing to build it after every change. This is the most efficient way to work when you are actively writing or testing code.

Simply use the `gitai` script, which is configured in `package.json` to execute the main script:

```bash
bun run gitai
```

Any changes you save to the source files will be reflected immediately when you run this command.

### Getting Help

To see all available commands and options, use the `--help` flag.

```bash
gitai --help
```

You can also get help for a specific subcommand:

```bash
gitai gh --help
```

```bash
gitai commit --help
```
