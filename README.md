# Student OS

A lightweight, budget-friendly desktop operating system for high school students — notes, planning, and school-life sync in one app. Built with Electron + React (Vite), Tiptap, and a local SQLite database.

## Features

- **Notes editor** — Tiptap-based rich text with fullscreen/focus mode (`Ctrl/Cmd+.`), image captions and freehand annotation (draw/highlight/arrow), inline and block KaTeX math (`/formula` slash command, click-to-insert symbol palette), spreadsheet/chart blocks, mindmaps (React Flow), lecture audio recording, and Gemini-powered inline autocomplete (Copilot-style ghost text).
- **Gemini study engine** — turns tagged notes into a study guide or practice exam on demand.
- **Google Calendar** — connect multiple Google accounts (e.g. personal + school), pick which of each account's calendars to sync, two-way: read events in, push new planner items out.
- **Google Classroom** — pulls courses → coursework → due dates, auto-creates homework entries, configurable reminder offsets (e.g. 3 days / 1 day / day-of).
- **Unified Calendar** — month/week/day views merging Google Calendar, Classroom deadlines, your class schedule, your personal daily routine, and manually-created tasks, each in its own color with quick filter chips.
- **Class schedule** — a recurring daily bell schedule (or A/B/rotating-day schedule) with per-period teacher/room, editable directly in Settings.
- **Daily routine** — a personal recurring schedule (wake time, study blocks, wind-down, etc.), separate from Google Calendar, with weekday/weekend variants.
- **Daily planner, dashboard, reminders, Pomodoro/stopwatch timer, PowerSchool ICS import.**

## Getting started

```bash
npm install
npm run dev
```

This starts Vite and Electron together. The app stores everything locally in a SQLite database under your OS's app-data directory — nothing is sent anywhere except the specific services you connect (Google, Gemini).

### Gemini (study guide / practice exam / autocomplete)

Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey), then paste it into **Settings → Gemini study engine**. Without a key, those features simply don't fire — no errors.

### Google Calendar + Classroom

1. Create a Google Cloud project and an OAuth **Desktop app** client ID (Cloud Console → APIs & Services → Credentials). Enable the Calendar API and the Classroom API.
2. Paste the Client ID / Client Secret into **Settings → Google accounts**.
3. Click **Connect a Google account** — this opens your browser, signs you in, and catches the redirect via a local loopback listener (no copy/paste of codes needed). Repeat for a second account (e.g. a school Workspace account) if you have one.
4. In **Settings → Calendars**, refresh and enable the calendars you want synced, and star one as the default for new items pushed from the app.
5. In **Settings → Classroom**, refresh and enable the courses you want auto-homework + reminders from.

## Building an installer

```bash
npm run dist
```

Uses `electron-builder`; output goes to `dist/`.

## Tech stack

Electron, React 18, Vite, Tailwind CSS, Tiptap 2, React Flow, Recharts, KaTeX, mathjs, better-sqlite3, `googleapis`, `@google/generative-ai`.

## Privacy / data model

All app data (notes, planner items, schedule, routine, tags, etc.) lives in a local SQLite file. OAuth tokens and API keys are encrypted at rest via Electron's `safeStorage` (OS keychain / DPAPI) before being written to disk. Nothing leaves the device except calls you explicitly trigger to Google or Gemini.
