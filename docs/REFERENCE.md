Youtube の動画：https://www.youtube.com/watch?v=my29RqLL-vg&t=458s
Youtube で実装されていたソースコードの一部：https://github.com/Aestheticsuraj234/coderabbit-assest/tree/main
Youtube の動画の概要欄（動画の説明）：
In this comprehensive tutorial, I'll show you how to build a complete AI-powered code review platform using cutting-edge technologies. This is a full-stack application that automatically reviews your GitHub pull requests using RAG (Retrieval Augmented Generation) and Google's Gemini AI.

TECH STACK:
Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4
UI Components: shadcn/ui, Radix UI
Backend: Next.js API Routes, Server Actions
Database: PostgreSQL with Prisma ORM
Vector Database: Pinecone (for RAG implementation)
AI/ML: Google Gemini AI (Gemini 2.5 Flash, text-embedding-004)
Background Jobs: Inngest (for async processing)
Authentication: Better Auth
Payments: Polar (subscription management)
Data Fetching: TanStack Query (React Query)
GitHub Integration: Octokit API
Charts: Recharts
Forms: React Hook Form + Zod validation

KEY FEATURES BUILT:

1. AI-Powered Code Reviews
   Automatic PR review generation using Gemini AI
   Context-aware reviews using RAG with Pinecone vector database
   Reviews include walkthrough, sequence diagrams, summary, strengths, issues, suggestions, and even poems!

2. GitHub Integration
   Connect multiple repositories
   Automatic webhook handling for PR events
   Real-time review generation on PR open/update
   Direct comment posting to GitHub PRs

3. RAG Implementation
   Automatic codebase indexing with vector embeddings
   Semantic search across entire codebase
   Context retrieval for better AI reviews

4. Dashboard & Analytics
   Real-time statistics (total repos, commits, PRs, reviews)
   GitHub contribution graph visualization
   Monthly activity breakdown (commits, PRs, reviews)
   Beautiful charts and data visualization

5. Review Management
   Complete review history
   Review status tracking (completed, pending, failed)
   Direct links to GitHub PRs
   Review preview and full content viewing

6. Repository Management
   Browse all GitHub repositories
   Connect/disconnect repositories
   Search and filter repositories
   Infinite scroll pagination
   Repository connection status tracking

7. Subscription System
   Free tier: 5 repositories, 5 reviews per repo
   Pro tier: Unlimited repositories and reviews
   Polar integration for payment processing
   Subscription status management
   Usage tracking and limits

8. User Management
   Better Auth authentication
   Profile settings
   User usage tracking
   Session management

9. Background Processing
   Inngest for async job processing
   Repository indexing jobs
   Review generation jobs
   Concurrency control

10. Modern UI/UX
    Responsive design
    Dark mode support
    Loading states and skeletons
    Toast notifications
    Beautiful shadcn/ui components

WHAT YOU'LL LEARN:

How to implement RAG (Retrieval Augmented Generation) with Pinecone
Building AI-powered features with Google Gemini AI
Setting up background job processing with Inngest
Creating a subscription SaaS with Polar
GitHub API integration and webhook handling
Vector embeddings and semantic search
Next.js 16 App Router patterns
React 19 Server Components and Client Components
Prisma database schema design
TanStack Query for data fetching
Authentication with Better Auth
Building production-ready dashboards

P

CodeHorse - Chapter Breakdown

00:00 - 7:44 - Introduction

7:45 - 22:56 - Chapter 1: Theory and Tech Stack

22:57 - 34:40 - Chapter 2: Next.js and Shadcn UI Initialization

34:41 - 46:32 - Chapter 3: Database Setup with Prisma

46:33 - 1:19:44 - Chapter 4: Authentication with Better Auth

1:19:45 - 1:48:00 - Chapter 5: Dashboard Layout and Sidebar

1:49:01 - 2:36:56 - Chapter 6: Dashboard Page and Backend API

2:36:57 - 3:02:56 - Chapter 7: Dashboard Page UI Implementation

3:02:57 - 3:37:20 - Chapter 8: Repository Fetching with Infinite Scrolling

3:37:21 - 4:09:44 - Chapter 9: Repository Connection with GitHub Webhooks

4:09:45 - 4:51:44 - Chapter 10: Settings Page Implementation

4:51:45 - 5:13:52 - Chapter 11: Inngest, AI SDK, and Pinecone Setup

5:13:53 - 5:48:08 - Chapter 12: Codebase Indexing with RAG

5:48:09 - 6:34:24 - Chapter 13: AI Code Review Implementation

6:34:25 - 6:47:28 - Chapter 14: Reviews Page UI

6:47:29 - 7:12:32 - Chapter 15: User Usage and Subscription Limits

7:12:33 - 7:51:52 - Chapter 16: Polar.sh Integration

7:51:53 - 8:29:20 - Chapter 17: Subscription Page UI Implementation

参考にしたいアプリ：https://github.com/coderabbitai/ai-pr-reviewer/tree/main
参考にしたいアプリで使われているもの：
1, https://github.com/octokit/octokit.js
2, https://github.com/dqbd/tiktokenizer
3, https://github.com/sindresorhus/p-limit
4, https://github.com/sindresorhus/p-retry
