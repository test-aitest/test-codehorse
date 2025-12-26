# CodeHorse Handler

Local handler for applying AI code review suggestions using Claude Code.

## Installation

```bash
npm install -g @codehorse/handler
```

## Setup

### 1. Register URL Scheme

The handler needs to be registered as a URL scheme handler so it can be triggered from the browser.

**macOS:**
```bash
./scripts/register-macos.sh
```

**Windows:**
```powershell
./scripts/register-windows.ps1
```

**Linux:**
```bash
./scripts/register-linux.sh
```

### 2. Configure Repository Paths

Tell the handler where your repositories are located:

```bash
codehorse-handler config set-repo "owner/repo-name" "/path/to/local/repo"
```

List configured repositories:
```bash
codehorse-handler config list
```

## Usage

### From CodeHorse Dashboard

1. Open a review in the CodeHorse dashboard
2. Click "Apply with Claude Code"
3. The handler will:
   - Fetch the review comments
   - Find your local repository
   - Invoke Claude Code with the review content
   - Claude Code will apply the fixes

### Manual Invocation

```bash
codehorse-handler "codehorse://apply?reviewId=xxx&token=yyy&apiUrl=https://codehorse.app"
```

## How It Works

1. **Dashboard** generates a one-time token for the review
2. **Browser** opens `codehorse://apply?...` URL
3. **Handler** catches the URL and:
   - Fetches review data from CodeHorse API
   - Builds a prompt with all review comments
   - Invokes Claude Code CLI
4. **Claude Code** reads the prompt and applies fixes

## Requirements

- Node.js 18+
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Git repository cloned locally

## Troubleshooting

### Handler not found
Make sure the handler is in your PATH:
```bash
which codehorse-handler
```

### Repository not found
Configure the repository path:
```bash
codehorse-handler config set-repo "owner/name" "/path/to/repo"
```

### Claude Code not installed
Install Claude Code:
```bash
npm install -g @anthropic-ai/claude-code
```
