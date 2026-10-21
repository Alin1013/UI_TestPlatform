# Enterprise UI Automation Framework

Hybrid end-to-end testing starter that uses Playwright for deterministic browser interaction and Midscene.js for visual assertions and extraction from unstructured content.

## Requirements

- Node.js 20 or newer
- An application environment exposing the dashboard selectors shown in `src/pages/dashboard.page.ts`
- An OpenAI-compatible model API key for Midscene assertions

## Local setup

```sh
npm ci
npx playwright install chromium
cp .env.example .env
```

Set `APP_BASE_URL` and `OPENAI_API_KEY` in `.env`. If your organization uses a compatible gateway, set `OPENAI_BASE_URL` and choose a supported `MIDSCENE_MODEL_NAME` there as well. Never commit `.env` or paste secrets into test code.

## Commands

```sh
npm run typecheck
npm test
npm run test:debug
npm run test:report
npm run clean
```

The dashboard scenario in `tests/dashboard.spec.ts` is intentionally skipped unless both the target URL and model key are configured. It assumes an `/dashboard` route, `iframe.secure-vendor-frame`, `input#corporate-email`, and `canvas#analytics-viewport`; adapt those selectors and the expected visual description to the application under test.

Playwright HTML/JUnit output, traces, screenshots, videos, and Midscene reports are kept under ignored report directories and can be archived by the included `Jenkinsfile`. Jenkins requires credentials named `OPENAI_API_KEY` and `APP_BASE_URL`.

## Design boundary

Use native Playwright locators, frame locators, and explicit waits for predictable interactions. Reserve Midscene for visual layout checks and extracting data that is not exposed through a reliable semantic DOM structure; this keeps the model in the uncertain 20% of the flow rather than making it the only control path.
